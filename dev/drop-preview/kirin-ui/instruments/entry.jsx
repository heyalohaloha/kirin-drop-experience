import React from 'react';
import { createRoot } from 'react-dom/client';
import KirinEye from './KirinEye.jsx';
import KirinVuPair from './KirinVuPair.jsx';
import { eyeReading, instrumentPosition } from './reading.mjs';
const t = (ja, en) => document.documentElement.lang === 'en' ? en : ja;
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
      <div className="eye-reading"><KirinEye reading={reading} size={148} label={reading ? t('キリンの目。全曲の測定から描いた模様。押すとLUFS-Mが最大の位置へ移動','Kirin Eye. Whole-track measurements. Press to seek to the maximum momentary loudness.') : t('キリンの目。十分なLUFS-Mの観測がありません','Kirin Eye. Not enough momentary loudness observations.')} title={reading ? t('全曲のLUFS-M・LRA・Bark。星の位置を聴き直す','Whole-track LUFS-M, LRA, and Bark. Listen at the star.') : t('模様を描ける測定が不足しています','Not enough measurements to draw the pattern.')} onActivate={showPeak} position={position.position} loudness={position.loudness} /><div><p className="instrument-label">KIRIN EYE</p><p>{t('全曲を、一つの模様に。','One track. One pattern.')}</p><span>{reading ? t('星を押して、いちばん大きい位置へ。','Press the star to seek to the loudest moment.') : t('短い音源や無音では模様を描きません。','No pattern for short or silent audio.')}</span></div></div>
      <div className="vu-reading"><p className="instrument-label">VU / LIVE POSITION</p><KirinVuPair level={position.level} /><p>{t('感度を変えて、同じ場所を聴く。','Change sensitivity. Listen to the same moment.')}</p><span>{result.channels === 1 ? t('モノラルは左右に同じ値を表示。','Mono displays the same value on both sides. ') : t('左右別々の整流平均。灯はSample Peak。','Independent channel rectification. Sample-peak lamps. ')}{t('設定はこの測定の間だけ。','Settings last for this measurement only.')}</span></div>
    </div>);
  }
  update(0);
  return { update, dispose() { if (!disposed) { disposed = true; root.unmount(); } } };
}
