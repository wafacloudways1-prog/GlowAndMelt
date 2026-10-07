const sb=window.supabaseClient,$=id=>document.getElementById(id);
const steps=[['payment_submitted','Payment submitted'],['payment_verified','Payment verified'],['processing','Processing'],['packed','Packed'],['shipped','Shipped'],['out_for_delivery','Out for delivery'],['delivered','Delivered']];
function normalizeStatus(o){if(o.status==='awaiting_payment')return o.payment_status==='pending_verification'?'payment_submitted':'payment_submitted';return o.status||'payment_submitted';}
function progress(o){const status=normalizeStatus(o);let idx=steps.findIndex(x=>x[0]===status);if(idx<0)idx=0;if(o.payment_status==='verified'&&idx<1)idx=1;return idx;}
function timeline(o){
 const idx=progress(o), paymentVerified=o.payment_status==='verified'||idx>=1;
 return `<div class="track-timeline">${steps.map((s,i)=>`<div class="track-step ${i<idx?'done':''} ${i===idx?'current':''} ${s[0]==='payment_verified'&&!paymentVerified?'pending-payment':''}"><span class="track-dot">${i<idx?'✓':i+1}</span><div><b>${s[1]}</b>${i===idx?'<small>Current status</small>':''}</div></div>`).join('')}</div>`;
}
async function init(){
 if(!sb)return $('orders').innerHTML='<p class="error">Supabase is not configured.</p>';
 const {data:{session}}=await sb.auth.getSession();if(!session){location.href='login.html';return;}
 const {data,error}=await sb.from('orders').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false});
 if(error)return $('orders').innerHTML=`<p class="error">${error.message}</p>`;
 $('orders').innerHTML=(data||[]).map(o=>`<article class="order-card">
   <div class="order-top"><div><h3>#${o.id.slice(0,8).toUpperCase()}</h3><p class="muted">${new Date(o.created_at).toLocaleString()}</p></div><span class="status">${(normalizeStatus(o)).replaceAll('_',' ')}</span></div>
   <div class="order-items">${(o.items||[]).map(i=>`<span>${i.name||i.product_id} × ${i.qty}</span>`).join('')}</div>
   <div class="track-summary"><span>Payment: <b>${o.payment_status||'pending'}</b></span><span>Total: <b>₹${Number(o.total).toFixed(0)}</b></span>${o.delivery_date?`<span>Expected: <b>${new Date(o.delivery_date+'T00:00:00').toLocaleDateString()}</b></span>`:''}</div>
   ${timeline(o)}
   <p class="muted">UTR: ${o.utr?o.utr:'Waiting for payment reference'}</p>
 </article>`).join('')||'<p class="muted">No orders yet. Your first candle is waiting.</p>';
}
init();