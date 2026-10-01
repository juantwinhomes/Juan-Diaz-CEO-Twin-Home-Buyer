import json,sys
TT=open('/tmp/claude-0/-workspace-Juan-Diaz-CEO-Twin-Home-Buyer/b693bc4f-f58f-53f1-af2d-c7d6e8bcbb7b/scratchpad/ttax.json').read()
LEDGER='https://claude.ai/artifact/G43ef83x7Ap9S5MG1eAGP3'
P=[
 ('820-28th-st','820 28th St','820 28th St, Oakland, CA 94608','1BrsVWqUK4yq-LuMYYBPS5Xs-cchmTp0G6ieeSkxWGe8','Active construction',''),
 ('751-27th-ave','751 27th Ave','751 27th Ave, San Mateo, CA 94403','1gWcuo0YCaBIj214ZldXWrh13E_a48-jE4qrkigqslkM','Active construction','Kiavi'),
 ('52-paramount-ter','52 Paramount Ter','52 Paramount Ter, San Francisco, CA 94118','1uwDdvfu38dkrznDo0UgxZ7T85czZTgobZx9F7Lq2ygE','Active construction','Anchor'),
 ('492-umland-dr','492 Umland Dr','492 Umland Dr, Santa Rosa, CA 95401','1vu3iFMu9-n3sV4qF9IQnXGPq5GSUmCFxWHCphR2p-Yo','Active construction','Anchor'),
 ('460-5th-ave','460 5th Ave','460 5th Ave, Redwood City, CA 94063','1F5HgEjECcxqAnXgXq4ENyx2MvfPqaWLSBYnHdXUyLQk','Active construction','Anchor'),
 ('27-prague-st','27 Prague St','27 Prague St, San Mateo, CA 94401','1HsmOuyMOXUJG-lPe9Rp63CieLIT_x9u2sMeztI8Sv3E','Active construction','Kiavi'),
 ('22496-avenue-18-3-4','22496 Avenue 18 3/4','22496 Avenue 18 3/4, Madera, CA 93637','1Mbp8AerswsSyfCWrNQzpay8Rl1NdIL-pRlTaRy4E_18','Upcoming construction','Anchor'),
]
t=open('template.html').read()
for slug,title,addr,sid,st,lender in P:
    cfg=json.dumps({"slug":slug,"address":addr,"sheetId":sid,"status":st,"lender":lender,"ledgerUrl":LEDGER}).replace('</','<\\/')
    open(f'{slug}.html','w').write(t.replace('__TITLE__',title).replace('__CONFIG__',cfg).replace('__TTAX__',TT))
print('ok')
