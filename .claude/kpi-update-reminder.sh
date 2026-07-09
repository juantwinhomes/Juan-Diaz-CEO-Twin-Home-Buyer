#!/usr/bin/env bash
# Injects a standing instruction reminding Claude to refresh the KPI dashboard
# artifact whenever Juan asks for an update. Emitted on every user prompt;
# Claude applies it only when the message is actually an update/status request.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"STANDING INSTRUCTION FROM JUAN: If this message is an update / status / refresh / recap request (e.g. 'give me an update', 'how are we doing', 'refresh the numbers'), then AFTER answering, regenerate the combined KPI dashboard and re-publish it as an artifact by calling the Artifact tool on /home/user/Juan-Diaz-CEO-Twin-Home-Buyer/thb_kpi_dashboard.html (reuse that exact file path so the artifact keeps its existing URL). Pull fresh QuickBooks / Monday.com / REI Blackbook figures where practical, and include the artifact link in your reply. If the message is clearly NOT an update request, ignore this instruction."}}
JSON
