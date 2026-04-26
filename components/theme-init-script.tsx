const CODE = `(function(){try{var t=localStorage.getItem('theme')||'system';var e=localStorage.getItem('eink')==='1';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var el=document.documentElement;if(r==='dark')el.classList.add('dark');if(e)el.classList.add('eink');el.style.colorScheme=e?'light':(r==='dark'?'dark':'light');}catch(e){}})();`;

export function ThemeInitScript() {
  return <script id="theme-init" dangerouslySetInnerHTML={{ __html: CODE }} />;
}
