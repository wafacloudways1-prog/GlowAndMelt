const sb=window.supabaseClient,$=id=>document.getElementById(id);
async function init(){
  if(!sb)return $('accountMsg').textContent='Supabase is not configured.';
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.href='login.html';return;}
  $('email').value=session.user.email||'';
  const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
  if(error){$('accountMsg').textContent=error.message;return;}
  if(data){$('name').value=data.full_name||session.user.user_metadata?.full_name||session.user.user_metadata?.name||'';$('phone').value=data.phone||'';$('address').value=data.address||'';$('city').value=data.city||'';$('state').value=data.state||'';$('pin').value=data.pin||'';}
}
$('accountForm').addEventListener('submit',async e=>{
 e.preventDefault(); $('accountMsg').textContent='Saving…';
 const {data:{session}}=await sb.auth.getSession();
 const row={id:session.user.id,full_name:$('name').value.trim(),email:session.user.email,phone:$('phone').value.trim(),address:$('address').value.trim(),city:$('city').value.trim(),state:$('state').value.trim(),pin:$('pin').value.trim(),country_code:'IN'};
 const {error}=await sb.from('profiles').upsert(row,{onConflict:'id'});
 $('accountMsg').textContent=error?error.message:'Delivery details saved ✦';
});
init();