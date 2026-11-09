const list=document.getElementById('blog-list');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let blogPosts=null, blogError=false;
const lang=()=>localStorage.getItem('anjuFarmLanguage')==='ne'?'ne':'en';
function renderBlog(){
 const ne=lang()==='ne';
 if(blogError){list.textContent=ne?'कथाहरू अहिले उपलब्ध छैनन्। कृपया पछि फेरि प्रयास गर्नुहोस्।':'Stories are temporarily unavailable. Please try again later.';return;}
 if(!blogPosts){list.textContent=ne?'कथाहरू लोड हुँदैछन्…':'Loading stories…';return;}
 list.innerHTML=blogPosts.length?blogPosts.map(p=>`<article class="blog-card"><span class="eyebrow">${esc(p.category)}</span><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p><a class="text-link" href="post.html?slug=${encodeURIComponent(p.slug)}">${ne?'कथा पढ्नुहोस् ↗':'Read story ↗'}</a></article>`).join(''):(ne?'<p>अहिलेसम्म कुनै कथा प्रकाशित भएको छैन। कृपया पछि फेरि हेर्नुहोस्।</p>':'<p>No stories have been published yet. Please check back soon.</p>');
}
document.addEventListener('anju-language-change',renderBlog);
(async()=>{try{const r=await fetch('/api/posts');if(!r.ok)throw Error();const data=await r.json();blogPosts=data.posts;renderBlog();}catch{blogError=true;renderBlog();}})();
