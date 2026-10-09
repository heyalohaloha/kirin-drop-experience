import React from 'react';
import { createRoot } from 'react-dom/client';
import KirinEye from './KirinEye.jsx';
import KirinVuPair from './KirinVuPair.jsx';
import { eyeReading, instrumentPosition } from './reading.mjs';
export function mountInstruments(container, result, seekTo) {
  const root = createRoot(container);
  // The full-track pattern stays immutable during playback; Iris/Face retain OS memoisation.
  const reading = eyeReading(result);
  let disposed = false;
  const showPeak = reading ? () => seekTo(reading.peakMs / 1000) : undefined;
  function update(seconds) {
    if (disposed) return;
    const position = instrumentPosition(result, seconds);
    root.render(<div className="instrument-pair">
      <div className="eye-reading"><KirinEye reading={reading} size={148} label={reading ? 'キリンの目。全曲の測定から描いた模様。押すとLUFS-Mが最大の位置へ移動' : 'キリンの目。十分なLUFS-Mの観測がありません'} title={reading ? '全曲のLUFS-M・LRA・Bark。星の位置を聴き直す' : '模様を描ける測定が不足しています'} onActivate={showPeak} position={position.position} loudness={position.loudness} /><div><p className="instrument-label">KIRIN EYE</p><p>全曲を、一つの模様に。</p><span>{reading ? '星を押して、いちばん大きい位置へ。' : '短い音源や無音では模様を描きません。'}</span></div></div>
      <div className="vu-reading"><p className="instrument-label">VU / LIVE POSITION</p><KirinVuPair level={position.level} /><p>感度を変えて、同じ場所を聴く。</p><span>{result.channels === 1 ? 'モノラルは左右に同じ値を表示。' : '左右別々の整流平均。灯はSample Peak。'}設定はこの測定の間だけ。</span></div>
    </div>);
  }
  update(0);
  return { update, dispose() { if (!disposed) { disposed = true; root.unmount(); } } };
}
