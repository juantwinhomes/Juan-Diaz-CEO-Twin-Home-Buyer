/* Card tracker sheets in Drive: which tab feeds which card and bucket. Marketing lives in the THB marketing file. */
const CARD_SHEETS=[
  {file:'1RgA-aQHe3e77MWRMHXIxQkSzXoZEwlnS',name:'AmEx Expense Tracker',tabs:[['Copy of Overhead Expenses','amex','overhead'],['Property Expenses','amex','property'],['PPS Expenses','amex','overhead']]},
  {file:'1D-5V4R9whYkX0bCrTuZp4sztdUeALttJ',name:'Capital One Expense Tracker',tabs:[['Personal Overhead Expenses','cap1p','overhead'],['Property Expenses - Cap One Per','cap1p','property'],['Business - Overhead Expense','cap1b','overhead'],['Capital One Business Property E','cap1b','property']]},
  {file:'125bkXWAu6v5CwCBPvncLdQRqEx50VN5f',name:'Discover Expense Tracker',tabs:[['Copy of Overhead Expenses','disc2645','overhead'],['Property Expenses','disc2645','property'],['PPS Expenses','disc2645','overhead']]},
  {file:'1oBnBWVC7gFYA_UIUkDdZfxGXp953GJNe',name:'Citi Expense Tracker',xlsx:true,tabs:[['Copy of Overhead Expenses','citi2149','overhead'],['Property Expenses','citi2149','property']]},
  {file:'1oRyqyx6g8VlnTvYkrM0_w45b12058QLl',name:'Bank of America Expense Tracker',xlsx:true,tabs:[['Overhead Expenses','boa0475','overhead'],['Property Expenses','boa0475','property'],['PPS Expenses','boa0475','overhead']]},
  {file:'1sIBMZbtKUcbdgGRX5D_WLzKSECPVSQb8',name:'Home Depot Expense Tracker',xlsx:true,tabs:[['5253','hd5253','property'],['1511','hd1511','property'],['8087','hd8087','property']]},
  {file:'1dmvRz8Zly1MVYMZ9yeJaVFfByKrMHoan',name:'THB Real Estate Marketing Expenses 2026',xlsx:true,marketing:true,tabs:[['5004 American Express','amex','marketing'],['Capital One - Business','cap1b','marketing'],['Capital One Personal','cap1p','marketing'],['Discover','disc2645','marketing'],['Bank of America','boa0475','marketing'],['Wells Fargo 6215','wf6215','marketing']]},
];
function sheetDate(v){ if(v instanceof Date&&!isNaN(v)) return v.toISOString().slice(0,10); const s=String(v??'').trim(); let m;
  if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))&&m[3]>='1990') return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; return ''; }
function parseCardSheet(wb,src){
  const out=[]; const notes=[];
  for(const [tab,card,bucket] of src.tabs){
    const ws=wb.Sheets[tab]; if(!ws){notes.push(`Tab “${tab}” not found`);continue;}
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    const hi=rows.slice(0,15).findIndex(r=>r&&r.some(c=>/^date$/i.test(String(c??'').trim()))); if(hi<0){notes.push(`No header on “${tab}”`);continue;}
    const H=rows[hi].map(c=>String(c??'').trim().toLowerCase()); const ix=n=>H.indexOf(n);
    let cA,cP,cDesc,cVen,cCat,cProp=ix('property'),cRc=ix('receipts link'),cSub=-1;
    if(src.marketing){ const u=ix('usage frequency'); cA=u+1; cP=u+2; cDesc=ix('simple charge description'); cVen=ix('vendor name'); cCat=ix('marketing type'); cSub=ix('lead channel'); }
    else { cP=H.findIndex(h=>h==='paid'); cA=ix('amount')>=0?ix('amount'):(cP>=0?cP+1:-1); cDesc=ix('description'); cVen=ix('vendor'); cCat=ix('category')>=0?ix('category'):ix('bucket'); cSub=ix('expense type'); }
    const cD=H.findIndex(h=>h==='date');
    if(cA<0){notes.push(`No amount column on “${tab}”`);continue;}
    const noPaid=cP<0; if(noPaid) notes.push(`“${tab}” has no Paid column, so its rows count as paid`);
    for(let i=hi+1;i<rows.length;i++){ const r=rows[i]||[]; const a=r[cA]; if(a==null||a===''||typeof a==='boolean'||a instanceof Date||isNaN(Number(a))) continue;
      const amount=Math.round(Number(a)*100)/100; if(!amount) continue; const date=sheetDate(r[cD]); if(!date) continue;
      const pv=noPaid?true:r[cP]; const paid=pv===true||String(pv).toUpperCase()==='TRUE';
      const vendor=String(r[cVen]??'').trim(), desc=String(r[cDesc]??'').trim();
      const rc=cRc>=0?(ws[XLSX.utils.encode_cell({r:i,c:cRc})]?.l?.Target||(/^https?:/.test(String(r[cRc]??''))?String(r[cRc]):'')):'';
      out.push({card,bucket,tab,date,vendor,desc,amount,paid,cat:String(r[cCat]??'').trim(),sub:cSub>=0?String(r[cSub]??'').trim():'',prop:cProp>=0?String(r[cProp]??'').replace(/["']/g,'').trim():'',rc});
    }
  }
  return {rows:out,notes};
}
