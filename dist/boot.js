import('./app.js').catch(error=>{
 console.error('平台页面加载未完成',error);
 const root=document.querySelector('#app');
 root.textContent='页面未能加载，请刷新后重试。';
 root.style.cssText='padding:40px;font:16px/2 sans-serif;color:#344850';
});
