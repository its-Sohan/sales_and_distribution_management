import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../src/App'
import {type ShopState} from '../../src/model'
import { initialState, findProduct } from './catalog'
import '../../src/styles.css'
import '../../src/receipt.css'
import '../../src/theme.css'
import '../../src/web-accessibility.css'
const params = new URLSearchParams(location.search)
const product = {...findProduct('mouse-opt'), en:'Pricing regression mouse', cost: params.has('stale') ? 500 : 550, inventoryValue: (params.has('stale') ? 500 : 550)*45, valuationStatus:'verified' as const, price:700}
let workspace: {revision:number;state:ShopState} = {revision:1,state:{...initialState,lines:params.has('invalid') ? [{productId:product.id, quantity:1000, unitPrice:549}] : [],discount:0,receipts:[],customProducts:params.has('empty') ? [] : [product],customCustomers:[],terminalId:1}}
// No real shop API calls: writes are captured to verify rejected edits never persist.
;(window as any).costRefreshes=0
;(window as any).writes=[]
;(window as any).raiseCost=()=>{workspace={...workspace,revision:workspace.revision+1,state:{...workspace.state,customProducts:[{...product,cost:550,inventoryValue:550*45}]}};document.dispatchEvent(new Event('visibilitychange'))}
window.fetch = async (_input, init) => {
 if(!init?.method && workspace.revision > 1) (window as any).costRefreshes++
 if(init?.method==='POST') {const mutation=JSON.parse(String(init.body));(window as any).writes.push(mutation);if(mutation.draft)workspace={...workspace,revision:workspace.revision+1,state:{...workspace.state,...mutation.draft}}}
 return new Response(JSON.stringify({ok:true,...workspace}),{status:200,headers:{'Content-Type':'application/json'}})
}
createRoot(document.getElementById('root')!).render(<App onSignOut={async()=>{}} lang="en" setLang={()=>{}} theme="light" setTheme={()=>{}}/>)
