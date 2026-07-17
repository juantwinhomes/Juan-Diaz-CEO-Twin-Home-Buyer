"""
Flip Scout — desktop app UI (Streamlit).

Run with:  streamlit run app.py

Pick cities (or all), pick the analysis brain, hit Run Scan. Dry Run needs
no API key — it shows the comp-discount candidates without LLM scoring.
"""

import os

import pandas as pd
import streamlit as st

from config import BUY_BOX, MAX_LEADS_TO_AGENT, REGIONS
from scout import full_scan

st.set_page_config(page_title="Flip Scout", page_icon="🏠", layout="wide")

st.title("🏠 Flip Scout")
st.caption(
    "Comps-first deal finder for Twin Home Buyer — a deal is a house "
    "**listed too low vs its 1-mile comps**, ugly or not."
)

# ----------------------------------------------------------------- sidebar
with st.sidebar:
    st.header("Scan settings")

    all_cities = st.checkbox("All cities", value=True)
    if all_cities:
        selected = list(REGIONS)
        st.multiselect("Cities", list(REGIONS), default=list(REGIONS),
                       disabled=True)
    else:
        selected = st.multiselect("Cities", list(REGIONS),
                                  default=["San Francisco"])

    st.divider()
    mode = st.radio(
        "Mode",
        ["Dry run (free — comps + math only)", "Full scan (LLM analysis)"],
        index=0)
    dry_run = mode.startswith("Dry")

    if not dry_run:
        provider = st.selectbox(
            "Analysis brain",
            ["anthropic", "xai", "grok-cli"],
            format_func={"anthropic": "Claude (Anthropic API)",
                         "xai": "Grok (xAI API)",
                         "grok-cli": "Grok (local CLI)"}.get)
        os.environ["FLIP_SCOUT_PROVIDER"] = provider
        if provider == "anthropic":
            key = st.text_input("ANTHROPIC_API_KEY", type="password",
                                value=os.environ.get("ANTHROPIC_API_KEY", ""))
            if key:
                os.environ["ANTHROPIC_API_KEY"] = key
        elif provider == "xai":
            key = st.text_input("XAI_API_KEY", type="password",
                                value=os.environ.get("XAI_API_KEY", ""))
            if key:
                os.environ["XAI_API_KEY"] = key
        else:
            st.info("Uses your local `grok` CLI and its existing login — "
                    "no key needed here.")

    st.divider()
    st.caption(
        f"Buy box: ${BUY_BOX['price_min']:,}–${BUY_BOX['price_max']:,} "
        f"(per-city caps apply) · {BUY_BOX['beds_min']}–{BUY_BOX['beds_max']} "
        f"beds · ≤{BUY_BOX['max_price_to_value']:.0%} of comp value · "
        f"≥{BUY_BOX['min_spread']:.0%} spread · LLM cap "
        f"{MAX_LEADS_TO_AGENT} leads/scan")

    run = st.button("▶ Run Scan", type="primary",
                    use_container_width=True, disabled=not selected)

# ------------------------------------------------------------------- main
if run:
    log_box = st.status("Scanning…", expanded=True)

    def progress(msg: str):
        log_box.write(msg)

    try:
        result = full_scan(region_names=selected, dry_run=dry_run,
                           progress=progress)
    except Exception as e:  # noqa: BLE001 — surface, don't crash the app
        log_box.update(label="Scan failed", state="error")
        st.error(f"Scan failed: {e}")
        st.stop()

    log_box.update(label="Scan complete", state="complete", expanded=False)
    st.session_state["result"] = result
    st.session_state["was_dry_run"] = dry_run

if "result" in st.session_state:
    result = st.session_state["result"]
    stats, candidates = result["stats"], result["candidates"]
    surfaced = result["surfaced"]
    was_dry = st.session_state.get("was_dry_run", True)

    # Funnel metrics
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("In-box listings", stats["in_box_listings"])
    c2.metric("New today", stats["new_listings"])
    c3.metric("Price drops", stats["price_drops"])
    c4.metric("Comp-discount candidates", stats["comp_discount_candidates"])

    # Candidates table
    st.subheader("Candidates (listed under comp value)")
    if candidates:
        rows = []
        for c in candidates:
            l, cr = c["listing"], c["comps"]
            rows.append({
                "City": c["region"],
                "Address": l["address"],
                "Price": l["price"],
                "% of comp value": round(cr["price_to_value"] * 100),
                "Comps": cr["comp_count"],
                "Beds": l["beds"],
                "Sqft": l["sqft"],
                "DOM": l["days_on_market"],
                "New": "🆕" if c["is_new"] else "",
                "Drop": f"−${c['price_drop']:,}" if c["price_drop"] else "",
                "Link": l["url"],
            })
        st.dataframe(
            pd.DataFrame(rows),
            use_container_width=True, hide_index=True,
            column_config={
                "Price": st.column_config.NumberColumn(format="$%d"),
                "Link": st.column_config.LinkColumn(display_text="Redfin ↗"),
            })
    else:
        st.info("No listings under the comp-discount threshold today. "
                "Discipline held.")

    # Scored leads (full scan only)
    if not was_dry:
        st.subheader(f"Scored leads — surfacing 8+ ({len(surfaced)})")
        if not surfaced:
            st.info("Nothing scored 8 or above today.")
        for s in surfaced:
            l, v = s["listing"], s["verdict"]
            tier = s["underwrite"]["tiers"][v["rehab_tier"]]
            amber = l["price"] and l["price"] > 1_500_000
            title = (f"{v['score']:.1f} · {v['verdict']} — {l['address']} "
                     f"(${l['price']:,})")
            with st.expander(title, expanded=True):
                if amber:
                    st.warning("Over $1.5M — Juan sign-off required "
                               "(historical loss zone)")
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("% of comp value",
                          f"{s['comps']['price_to_value']:.0%}")
                m2.metric("ARV", f"${s['underwrite']['arv']:,}")
                m3.metric(f"Rehab ({v['rehab_tier']})", f"${tier['rehab']:,}")
                m4.metric("Net / spread",
                          f"${tier['net_profit']:,} / {tier['spread']:.0%}")
                st.markdown(
                    f"**Condition:** {v['condition_read']}  \n"
                    f"**ADU:** {v['adu_potential']}  \n"
                    f"**Risks:** {'; '.join(v['key_risks'])}  \n"
                    f"**Next step:** {v['recommended_next_step']}  \n"
                    f"[Open on Redfin]({l['url']})")
                st.write(v["email_summary"])

        if result["report"]:
            st.download_button(
                "⬇ Download email-ready report (.md)",
                result["report"],
                file_name=f"flip-scout-{stats['date']}.md",
                use_container_width=True)
else:
    st.info("Pick your cities in the sidebar and hit **Run Scan**. "
            "Start with a dry run — it's free and needs no API key.")
