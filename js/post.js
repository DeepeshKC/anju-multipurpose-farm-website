const article=document.getElementById('post');
let loadedPost=null, postError=false;
const lang=()=>localStorage.getItem('anjuFarmLanguage')==='ne'?'ne':'en';
function renderPost(){
 const ne=lang()==='ne';
 if(postError){article.textContent=ne?'यो कथा उपलब्ध छैन वा प्रकाशित भएको छैन।':'This story is unavailable or has not been published.';return;}
 if(!loadedPost){article.textContent=ne?'कथा लोड हुँदैछ…':'Loading story…';return;}
 const p=loadedPost;
 document.title=p.title+' | '+(ne?'अञ्जु फार्म':'Anju Farm');
 const h=document.createElement('h1');h.textContent=p.title;
 const category=document.createElement('span');category.className='eyebrow';category.textContent=p.category;
 const back=document.createElement('a');back.href='blog.html';back.className='blog-back';back.textContent=ne?'← सबै कथाहरू':'← All stories';
 article.replaceChildren(back,category,h);
 for(const para of p.content.split(/\n\s*\n/).filter(Boolean)){const el=document.createElement('p');el.textContent=para;article.append(el);}
}
document.addEventListener('anju-language-change',renderPost);
(async()=>{const slug=new URLSearchParams(location.search).get('slug');if(!slug){postError=true;renderPost();return;}try{const r=await fetch('/api/post/'+encodeURIComponent(slug));if(!r.ok)throw Error();const data=await r.json();loadedPost=data.post;renderPost();}catch{postError=true;renderPost();}})();
