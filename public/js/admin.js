const sb=window.supabaseClient,$=id=>document.getElementById(id);
const ADMIN_EMAIL='wafaabbas1636@gmail.com';
const STATUSES=[['payment_submitted','Payment submitted'],['payment_verified','Payment verified'],['processing','Processing'],['packed','Packed'],['shipped','Shipped'],['out_for_delivery','Out for delivery'],['delivered','Delivered']];
let currentSession=null,products=[],orders=[],editingId=null,existingImages=[];

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(v){return `₹${Number(v||0).toFixed(0)}`;}
function statusLabel(v){return (v||'payment_submitted').replaceAll('_',' ');}
function imageList(p){if(Array.isArray(p.image_urls)&&p.image_urls.length)return p.image_urls;if(p.image_url)return [p.image_url];return [];}

async function load(){
 if(!sb){$('adminMsg').textContent='Supabase is not configured.';return;}
 const {data:{session}}=await sb.auth.getSession();currentSession=session;
 if(!session){showGate('Sign in with the admin Google account.');return;}
 if((session.user.email||'').toLowerCase()!==ADMIN_EMAIL){await sb.auth.signOut();showGate(`Only ${ADMIN_EMAIL} can access the admin panel.`);return;}
 $('adminGate').classList.add('hidden');$('adminPanel').classList.remove('hidden');await refresh();
}
function showGate(msg){$('adminGate').classList.remove('hidden');$('adminPanel').classList.add('hidden');$('adminMsg').textContent=msg||'';}
async function adminLogin(){
 const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/admin.html',queryParams:{access_type:'offline',prompt:'select_account'}}});
 if(error)$('adminMsg').textContent=error.message;
}
async function refresh(){
 if(!currentSession)return;
 await Promise.all([loadOrders(),loadProducts(),loadStats()]);
}
async function loadStats(){
 const [o,p]=await Promise.all([sb.from('orders').select('id,total,payment_status,status'),sb.from('products').select('id,active,price,discount')]);
 const os=o.data||[],ps=p.data||[];
 const revenue=os.filter(x=>x.payment_status==='verified').reduce((s,x)=>s+Number(x.total||0),0);
 $('stats').innerHTML=[
  ['📦','Total orders',os.length],
  ['⏳','Needs attention',os.filter(x=>x.payment_status==='pending_verification').length],
  ['🕯️','Visible products',ps.filter(x=>x.active).length],
  ['💰','Verified sales',money(revenue)]
 ].map(x=>`<div class="stat-card"><span>${x[0]}</span><div><small>${x[1]}</small><b>${x[2]}</b></div></div>`).join('');
}
async function loadOrders(){
 const {data,error}=await sb.from('orders').select('*').order('created_at',{ascending:false});
 if(error){$('adminOrders').innerHTML=`<p class="error">${error.message}</p>`;return;}
 orders=data||[];renderOrders();
}
function renderOrders(){
 const filter=$('orderFilter').value;
 const list=orders.filter(o=>filter==='all'||(o.status||'payment_submitted')===filter);
 $('adminOrders').innerHTML=list.map(o=>{
   const items=(o.items||[]).map(i=>`${esc(i.name||i.product_id)} × ${i.qty}`).join(' · ');
   const selectedStatus=o.status==='awaiting_payment'?'payment_submitted':(o.status||'payment_submitted');
   return `<article class="admin-order-card">
    <div class="admin-order-top"><div><h3>#${o.id.slice(0,8).toUpperCase()}</h3><p class="muted">${new Date(o.created_at).toLocaleString()}</p></div><span class="status">${esc(statusLabel(selectedStatus))}</span></div>
    <div class="admin-order-grid"><div><b>Customer</b><p>${esc(o.customer_name)} · ${esc(o.phone)}</p><p>${esc(o.address)}, ${esc(o.city)}, ${esc(o.state||'')} ${esc(o.pin)}</p></div><div><b>Order</b><p>${items||'No items'}</p><p><strong>${money(o.total)}</strong></p></div></div>
    <div class="admin-payment"><span>Payment: <b>${esc(o.payment_status||'pending')}</b></span><span>UTR: <b>${esc(o.utr||'—')}</b></span></div>
    ${o.payment_status==='pending_verification' && o.utr ? `<div class="payment-verification">
      <button class="btn gold approve-payment" data-id="${o.id}">✓ Approve payment</button>
      <button class="danger-btn reject-payment" data-id="${o.id}">Reject payment</button>
    </div>` : ''}
    <div class="admin-order-controls"><label>Order status<select class="order-status" data-id="${o.id}">${STATUSES.map(s=>`<option value="${s[0]}" ${selectedStatus===s[0]?'selected':''}>${s[1]}</option>`).join('')}</select></label>
    <label>Payment status<select class="payment-status" data-id="${o.id}"><option value="pending_payment" ${o.payment_status==='pending_payment'?'selected':''}>Pending payment</option><option value="pending_verification" ${o.payment_status==='pending_verification'?'selected':''}>Payment submitted</option><option value="verified" ${o.payment_status==='verified'?'selected':''}>Payment verified</option><option value="rejected" ${o.payment_status==='rejected'?'selected':''}>Rejected</option></select></label>
    <label>Expected delivery<input class="delivery-date" data-id="${o.id}" type="date" value="${o.delivery_date||''}"></label>
    <button class="btn gold save-order" data-id="${o.id}">Save order</button></div>
   </article>`;
 }).join('')||'<p class="muted">No orders found.</p>';
 document.querySelectorAll('.save-order').forEach(b=>b.onclick=()=>saveOrder(b.dataset.id));
 document.querySelectorAll('.approve-payment').forEach(b=>b.onclick=()=>approvePayment(b.dataset.id));
 document.querySelectorAll('.reject-payment').forEach(b=>b.onclick=()=>rejectPayment(b.dataset.id));
}
async function saveOrder(id){
 const status=document.querySelector(`.order-status[data-id="${id}"]`).value;
 const delivery_date=document.querySelector(`.delivery-date[data-id="${id}"]`).value||null;
 const {error}=await sb.from('orders').update({status,delivery_date}).eq('id',id);
 if(error) alert(error.message); else await refresh();
}
async function approvePayment(id){
 const {error}=await sb.rpc('admin_verify_payment',{p_order_id:id,p_approved:true});
 if(error) alert(error.message); else await refresh();
}
async function rejectPayment(id){
 if(!confirm('Reject this payment reference? The customer will need to submit a new UTR.')) return;
 const {error}=await sb.rpc('admin_verify_payment',{p_order_id:id,p_approved:false});
 if(error) alert(error.message); else await refresh();
}
async function loadProducts(){
 const {data,error}=await sb.from('products').select('*').order('created_at',{ascending:false});
 if(error){$('adminProducts').innerHTML=`<p class="error">${error.message}</p>`;return;}
 products=data||[];renderProducts();
}
function renderProducts(){
 $('adminProducts').innerHTML=products.map(p=>{
  const imgs=imageList(p);
  return `<article class="admin-product-card">
    <div class="admin-product-photo">${imgs[0]?`<img src="${esc(imgs[0])}" alt="${esc(p.name)}">`:'<div class="mini-candle"></div>'}<span class="visibility ${p.active?'visible':'hidden-state'}">${p.active?'Visible':'Hidden'}</span></div>
    <div class="admin-product-body"><div class="admin-product-title"><div><h3>${esc(p.name)}</h3><p class="muted">${esc(p.description||'')}</p></div><b>${money(Math.max(0,Number(p.price)-Number(p.discount||0)))}</b></div>
    <p class="product-meta">Price ${money(p.price)} · Discount ${money(p.discount)} · ${imgs.length} photo${imgs.length===1?'':'s'}</p>
    <div class="admin-actions"><button class="ghost-btn" onclick="editProduct('${esc(p.id)}')">Edit</button><button class="ghost-btn" onclick="toggleProduct('${esc(p.id)}',${!p.active})">${p.active?'Hide':'Show'}</button><button class="danger-btn" onclick="deleteProduct('${esc(p.id)}')">Delete</button></div></div>
  </article>`;
 }).join('')||'<p class="muted">No products yet. Add your first candle above.</p>';
}
function previewFiles(){
 const files=[...$('pfiles').files].slice(0,4);
 $('photoPreview').innerHTML=files.map(f=>`<div><img src="${URL.createObjectURL(f)}" alt=""><small>${esc(f.name)}</small></div>`).join('');
 if($('pfiles').files.length>4)$('productMsg').textContent='Only the first 4 photos will be uploaded.';
}
function resetForm(){
 editingId=null;existingImages=[];$('productForm').reset();$('pid').value='';$('pdiscount').value='0';$('productFormTitle').textContent='Add product';$('saveProductBtn').textContent='Add product';$('cancelEdit').classList.add('hidden');$('photoPreview').innerHTML='';
}
function editProduct(id){
 const p=products.find(x=>x.id===id);if(!p)return;editingId=id;existingImages=imageList(p);
 $('pid').value=p.id;$('pname').value=p.name||'';$('pprice').value=p.price||0;$('pdiscount').value=p.discount||0;$('pdesc').value=p.description||'';$('purls').value='';
 $('pfiles').value='';$('productFormTitle').textContent='Edit product';$('saveProductBtn').textContent='Save changes';$('cancelEdit').classList.remove('hidden');renderExistingPreview();
 document.getElementById('productsTab').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderExistingPreview(){
 $('photoPreview').innerHTML=existingImages.map((u,i)=>`<div class="existing-photo"><img src="${esc(u)}" alt=""><button type="button" onclick="removeExistingImage(${i})">×</button></div>`).join('');
}
function removeExistingImage(i){existingImages.splice(i,1);renderExistingPreview();}
async function uploadFiles(files){
 const urls=[];for(const file of [...files].slice(0,4)){
  const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');
  const path=`products/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const {error}=await sb.storage.from('product-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(error)throw error;
  const {data}=sb.storage.from('product-images').getPublicUrl(path);urls.push(data.publicUrl);
 }return urls;
}
async function saveProduct(e){
 e.preventDefault();$('productMsg').textContent='Saving product…';
 const name=$('pname').value.trim(),price=Number($('pprice').value),discount=Number($('pdiscount').value||0),description=$('pdesc').value.trim();
 if(!name||price<0)return $('productMsg').textContent='Enter a product name and valid price.';
 let urls=existingImages.slice();
 const manual=$('purls').value.split('\n').map(x=>x.trim()).filter(Boolean);
 if(manual.length)urls=manual.slice(0,4);
 try{if($('pfiles').files.length)urls=(await uploadFiles($('pfiles').files)).slice(0,4);}
 catch(err){$('productMsg').textContent='Photo upload failed: '+err.message;return;}
 const current=editingId?products.find(x=>x.id===editingId):null; const row={name,description,price,discount,active:current?!!current.active:true,image_urls:urls};
 let error;
 if(editingId){({error}=await sb.from('products').update(row).eq('id',editingId));}
 else{row.id=`${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'product'}-${Date.now()}`;({error}=await sb.from('products').insert(row));}
 if(error){$('productMsg').textContent=error.message;return;}
 $('productMsg').textContent=editingId?'Product updated ✦':'Product added ✦';resetForm();await refresh();
}
async function toggleProduct(id,active){const {error}=await sb.from('products').update({active}).eq('id',id);if(error)alert(error.message);else refresh();}
async function deleteProduct(id){if(!confirm('Delete this product permanently?'))return;const {error}=await sb.from('products').delete().eq('id',id);if(error)alert(error.message);else refresh();}
$('googleAdminBtn').onclick=adminLogin;
$('adminLogout').onclick=async()=>{await sb.auth.signOut();location.href='index.html';};
$('refreshAdmin').onclick=refresh;
$('cancelEdit').onclick=resetForm;
$('pfiles').onchange=previewFiles;
$('orderFilter').onchange=renderOrders;
document.querySelectorAll('.admin-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#ordersTab,#productsTab').forEach(x=>x.classList.add('hidden'));document.getElementById(b.dataset.tab).classList.remove('hidden');document.querySelectorAll('.admin-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');});
$('productForm').onsubmit=saveProduct;
window.toggleProduct=toggleProduct;window.deleteProduct=deleteProduct;window.editProduct=editProduct;window.removeExistingImage=removeExistingImage;
load();
window.approvePayment=approvePayment; window.rejectPayment=rejectPayment;
