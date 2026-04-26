import Script from "next/script";

const CODE = `(function(){try{var t=localStorage.getItem('theme')||'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var el=document.documentElement;if(r==='dark')el.classList.add('dark');if(r==='eink')el.classList.add('eink');el.style.colorScheme=r==='dark'?'dark':'light';}catch(e){}})();`;

export function ThemeInitScript() {
  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {CODE}
    </Script>
  );
}
