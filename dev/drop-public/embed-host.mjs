const frame=document.getElementById('kirin-drop-frame');
if(frame) {
  // The reported body height is the inner viewport; include the host border
  // so expanding results does not create a second (two-pixel) scrollbar.
  const setHeight=height=>{
    frame.style.height=`${height+frame.offsetHeight-frame.clientHeight}px`;
  };
  const applyHeight=()=>{
    const body=frame.contentDocument?.body;
    if(body) setHeight(Math.ceil(body.scrollHeight));
  };
  frame.addEventListener('load',applyHeight);
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==frame.contentWindow || event.data?.type!=='kirin-drop-height') return;
    const height=event.data.height;
    if(Number.isSafeInteger(height) && height>0) setHeight(height);
  });
}
