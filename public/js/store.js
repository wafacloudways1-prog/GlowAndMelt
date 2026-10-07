const sb=window.supabaseClient;
const $=id=>document.getElementById(id);
let products=[];
let cart=JSON.parse(localStorage.getItem('glow_melt_cart')||'[]');

const seed=[['moon-dust','Moon Dust','Warm vanilla · amber',699],['midnight-tea','Midnight Tea','Black tea · cedar · musk',749],['soft-orbit','Soft Orbit','Cream · sandalwood · cashmere',649],['after-rain','After Rain','Rainwater · jasmine · moss',699]];

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function imageList(p){if(Array.isArray(p.image_urls)&&p.image_urls.length)return p.image_urls;if(p.image_url)return [p.image_url];return [];}

async function load(){
  if(sb){
    const {data}=await sb.from('products').select('*').eq('active',true).order('created_at');
    if(data?.length)products=data.map(p=>({...p,price:Math.max(0,Number(p.price)-Number(p.discount||0))}));
  }
  if(!products.length)products=seed.map(([id,name,desc,price])=>({id,name,description:desc,price}));
  render();updateCart();await loadUser();
}
function render(){
  const el=$('products');if(!el)return;
  el.innerHTML=products.map(p=>{
    const imgs=imageList(p);
    const src=imgs[0];
    return `<article class="product-card">
      <div class="product-art ${src?'has-photo':''}">
        ${src?`<img class="product-photo" src="${esc(src)}" alt="${esc(p.name)}">`:'<div class="mini-candle"></div><div class="mini-flame"></div>'}
        ${imgs.length>1?`<span class="photo-count">✦ ${imgs.length} photos</span>`:''}
        ${Number(p.discount||0)>0?`<span class="discount-badge">-₹${Number(p.discount).toFixed(0)}</span>`:''}
      </div>
      <div class="product-info"><h3>${esc(p.name)}</h3><p>${esc(p.description||'A hand-poured Glow & Melt candle.')}</p>
      <div class="product-bottom"><span class="price">₹${Number(p.price).toFixed(0)}</span><button class="add-btn" onclick="addToCart('${esc(p.id)}')">Add +</button></div></div>
    </article>`;
  }).join('');
}
function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const x=cart.find(x=>x.id===id);x?x.qty++:cart.push({id:p.id,name:p.name,price:p.price,qty:1});save();openCart();}
function removeFromCart(id){cart=cart.filter(x=>x.id!==id);save();}
function save(){localStorage.setItem('glow_melt_cart',JSON.stringify(cart));updateCart();}
function updateCart(){
  const count=cart.reduce((s,x)=>s+x.qty,0);
  if($('cartCount'))$('cartCount').textContent=count;
  if($('menuCartCount'))$('menuCartCount').textContent=count;
  if(!$('cartItems'))return;
  $('cartItems').innerHTML=cart.length?cart.map(x=>`<div class="cart-row"><div class="cart-thumb"><div class="mini-candle"></div></div><div><h4>${esc(x.name)}</h4><p>₹${Number(x.price).toFixed(0)} × ${x.qty}</p></div><button class="remove" onclick="removeFromCart('${esc(x.id)}')">×</button></div>`).join(''):'<p class="muted">Your bag is empty. Add something warm. ✦</p>';
  $('cartTotal').textContent=cart.reduce((s,x)=>s+x.price*x.qty,0).toFixed(0);
}
function openCart(){$('cartDrawer')?.classList.add('open');$('menuDrawer')?.classList.remove('open');}
function closeCart(){$('cartDrawer')?.classList.remove('open');}
function openMenu(){$('menuDrawer')?.classList.add('open');$('cartDrawer')?.classList.remove('open');}
function closeMenu(){$('menuDrawer')?.classList.remove('open');}
async function loadUser(){
  if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();
  const link=$('accountLink');
  if(session){
    const name=session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.email?.split('@')[0]||'Account';
    if(link){link.textContent='Account';link.href='account.html';}
    if($('menuUserName'))$('menuUserName').textContent=name;
    if($('menuUserEmail'))$('menuUserEmail').textContent=session.user.email||'';
  }
}
$('cartBtn')?.addEventListener('click',openCart);
$('closeCart')?.addEventListener('click',closeCart);
$('checkoutBtn')?.addEventListener('click',()=>{if(!cart.length)return alert('Your bag is empty.');location.href='checkout.html'});
$('menuToggle')?.addEventListener('click',openMenu);
$('closeMenu')?.addEventListener('click',closeMenu);
$('menuCart')?.addEventListener('click',e=>{e.preventDefault();openCart()});
document.querySelectorAll('[data-close-menu]').forEach(x=>x.addEventListener('click',closeMenu));
$('menuSignOut')?.addEventListener('click',async()=>{
  if(!sb)return;
  const {error}=await sb.auth.signOut();
  if(error){$('menuMsg').textContent=error.message;return;}
  closeMenu();location.reload();
});
window.addToCart=addToCart;window.removeFromCart=removeFromCart;load();