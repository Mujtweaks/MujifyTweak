import { useEffect, useRef, useState } from "react";

/**
 * SplashIntro — the cinematic "power on" logo animation shown when the app opens.
 *
 * Story: power enters the circuits → traces energize → the gear assembles and
 * spins heavy → the arrow launches through it (the boost) → the wordmark lands →
 * one soft highlight sweep → done. ~2.7s, then it fades itself out.
 *
 * Engineering notes (the guardrails that keep this at 60fps in WebView2):
 * - Zero dependencies: the whole timeline is scoped CSS keyframes — no GSAP.
 * - Only `transform` + `opacity` (+ stroke-dashoffset for the trace draw) are
 *   animated. No SVG filter is ever animated: all "glow/bloom" is static
 *   radial-gradient layers whose opacity fades.
 * - "Motion blur" on the arrow is faked with a gradient streak; the "particle"
 *   is one spark riding the trunk via CSS offset-path.
 * - prefers-reduced-motion: the sequence is skipped and the finished logo simply
 *   fades in; the splash also dismisses sooner.
 * - Click anywhere to skip instantly.
 */
export default function SplashIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const finish = (delay: number) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    window.setTimeout(onDone, delay);
  };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => finish(320), reduce ? 900 : 2850);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={() => finish(220)}
      className={`mjfx-splash fixed inset-0 z-[200] grid cursor-pointer place-items-center bg-black transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
      title="Click to skip"
    >
      <svg
        viewBox="0 0 430 200"
        className="w-[min(560px,80vw)]"
        role="img"
        aria-label="Mujify Tweaks"
      >
        <defs>
          {/* Static glows — radial gradients, never an animated filter. */}
          <radialGradient id="mjGearGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF3B3B" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#E3000E" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#E3000E" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mjSparkHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF3B3B" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#FF3B3B" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FF3B3B" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mjStreak" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF3B3B" stopOpacity="0" />
            <stop offset="70%" stopColor="#FF3B3B" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FF6B6B" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="mjSweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ---------- Scene 2: circuit traces (drawn via dashoffset) ---------- */}
        <g stroke="#E3000E" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path className="mj-trace mj-t1" pathLength={1} d="M16 100 H52" />
          <path className="mj-trace mj-t2" pathLength={1} d="M26 68 V86 H52" />
          <path className="mj-trace mj-t3" pathLength={1} d="M26 132 V114 H52" />
          <path className="mj-trace mj-t4" pathLength={1} d="M42 56 H62 V78" />
        </g>
        {/* Circuit nodes — pop in as the energy reaches them. */}
        <g fill="#E3000E">
          <circle className="mj-node mj-n1" cx="12" cy="100" r="4" />
          <circle className="mj-node mj-n2" cx="26" cy="64" r="3.5" />
          <circle className="mj-node mj-n3" cx="26" cy="136" r="3.5" />
          <circle className="mj-node mj-n4" cx="38" cy="56" r="3.5" />
          <circle className="mj-node mj-n5" cx="10" cy="80" r="2.5" />
          <circle className="mj-node mj-n6" cx="10" cy="120" r="2.5" />
        </g>

        {/* Scene 1: the boot spark — rides the trunk into the gear. */}
        <g className="mj-spark">
          <circle r="11" fill="url(#mjSparkHalo)" />
          <circle r="3.5" fill="#FF3B3B" />
        </g>

        {/* ---------- Scene 3: the gear ---------- */}
        <circle className="mj-glow" cx="105" cy="100" r="66" fill="url(#mjGearGlow)" />
        <g className="mj-gearPop">
          <g className="mj-gearBounce">
            <g className="mj-gearSpin">
              <g transform="translate(105 100)" fill="#E3000E">
                {/* teeth */}
                <g>
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <rect key={a} x="-8" y="-58" width="16" height="22" rx="3" transform={`rotate(${a})`} />
                  ))}
                </g>
                <circle r="42" />
                <circle r="17" fill="#000000" />
              </g>
            </g>
          </g>
        </g>

        {/* Scene 4: energy wave when the arrow lands. */}
        <circle className="mj-ring" cx="105" cy="100" r="48" fill="none" stroke="#FF3B3B" strokeWidth="3" />

        {/* ---------- Scene 4: the arrow (launches up-through the gear) ---------- */}
        <g className="mj-arrowLaunch">
          <g transform="rotate(-45 105 100)">
            {/* motion-blur fake: gradient streak trailing the arrow */}
            <rect className="mj-streak" x="6" y="94" width="126" height="12" rx="6" fill="url(#mjStreak)" />
            {/* black "cut" so the arrow visually slices the gear */}
            <g fill="#000000">
              <rect x="42" y="87" width="100" height="26" rx="6" />
              <polygon points="128,74 178,100 128,126" />
            </g>
            {/* the red arrow itself */}
            <g fill="#E3000E">
              <rect x="48" y="93" width="88" height="14" rx="3" />
              <polygon points="134,82 168,100 134,118" />
            </g>
          </g>
        </g>

        {/* ---------- Scene 5: wordmark ---------- */}
        <text className="mj-word1" x="186" y="110" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="58" letterSpacing="-1.5" fill="#E3000E">
          Mujify
        </text>
        <text className="mj-word2" x="189" y="154" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="34" letterSpacing="-0.5" fill="#FF2D2D">
          Tweaks
        </text>

        {/* ---------- Scene 6: highlight sweep ---------- */}
        <g className="mj-sweepMove">
          <rect x="-70" y="10" width="56" height="180" fill="url(#mjSweep)" transform="skewX(-12)" />
        </g>
      </svg>

      {/* Scoped timeline. transform+opacity (+dashoffset) only — no animated filters. */}
      <style>{`
.mjfx-splash .mj-trace{stroke-dasharray:1;stroke-dashoffset:1;animation:mjDraw .38s cubic-bezier(.55,.06,.35,1) forwards}
.mjfx-splash .mj-t1{animation-delay:.34s}
.mjfx-splash .mj-t2{animation-delay:.50s}
.mjfx-splash .mj-t3{animation-delay:.56s}
.mjfx-splash .mj-t4{animation-delay:.62s}
@keyframes mjDraw{to{stroke-dashoffset:0}}

.mjfx-splash .mj-node{opacity:0;transform:scale(.3);transform-box:fill-box;transform-origin:center;
  animation:mjPop .34s cubic-bezier(.2,1.4,.4,1) forwards}
.mjfx-splash .mj-n1{animation-delay:.12s}
.mjfx-splash .mj-n2{animation-delay:.80s}
.mjfx-splash .mj-n3{animation-delay:.86s}
.mjfx-splash .mj-n4{animation-delay:.92s}
.mjfx-splash .mj-n5{animation-delay:.96s}
.mjfx-splash .mj-n6{animation-delay:1.00s}
@keyframes mjPop{0%{opacity:0;transform:scale(.3)}60%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}

.mjfx-splash .mj-spark{opacity:0;offset-path:path("M16 100 H52");offset-rotate:0deg;
  animation:mjSparkIn .3s ease-out .06s forwards, mjSparkRide .42s cubic-bezier(.6,.05,.4,1) .34s forwards}
@keyframes mjSparkIn{0%{opacity:0}60%{opacity:1}80%{opacity:.75}100%{opacity:1}}
@keyframes mjSparkRide{0%{offset-distance:0%;opacity:1}85%{opacity:1}100%{offset-distance:100%;opacity:0}}

.mjfx-splash .mj-glow{opacity:0;animation:mjGlowIn .5s ease-out .88s forwards}
@keyframes mjGlowIn{0%{opacity:0}70%{opacity:.6}100%{opacity:.45}}

.mjfx-splash .mj-gearPop{opacity:0;transform:scale(.55);transform-box:fill-box;transform-origin:center;
  animation:mjGearIn .3s cubic-bezier(.2,1.1,.35,1.15) .88s forwards}
@keyframes mjGearIn{to{opacity:1;transform:scale(1)}}

.mjfx-splash .mj-gearSpin{transform:rotate(0deg);transform-box:fill-box;transform-origin:center;
  animation:mjSpin .62s cubic-bezier(.25,.9,.3,1) .98s forwards}
@keyframes mjSpin{0%{transform:rotate(0deg)}72%{transform:rotate(229deg)}86%{transform:rotate(216deg)}100%{transform:rotate(220deg)}}

.mjfx-splash .mj-gearBounce{transform-box:fill-box;transform-origin:center;
  animation:mjBounce .3s ease-out 1.72s}
@keyframes mjBounce{0%{transform:scale(1)}40%{transform:scale(1.03)}100%{transform:scale(1)}}

.mjfx-splash .mj-arrowLaunch{opacity:0;transform:translate(-48px,48px);
  animation:mjLaunch .3s cubic-bezier(.18,.9,.25,1) 1.5s forwards}
@keyframes mjLaunch{0%{opacity:0;transform:translate(-48px,48px)}45%{opacity:1}100%{opacity:1;transform:translate(0,0)}}

.mjfx-splash .mj-streak{opacity:0;transform:translateX(-26px);
  animation:mjStreakFlash .4s ease-out 1.52s}
@keyframes mjStreakFlash{0%{opacity:0;transform:translateX(-26px)}35%{opacity:.9;transform:translateX(-6px)}100%{opacity:0;transform:translateX(2px)}}

.mjfx-splash .mj-ring{opacity:0;transform:scale(.4);transform-box:fill-box;transform-origin:center;
  animation:mjRing .5s cubic-bezier(.2,.7,.3,1) 1.66s}
@keyframes mjRing{0%{opacity:.85;transform:scale(.4)}100%{opacity:0;transform:scale(1.65)}}

.mjfx-splash .mj-word1{opacity:0;transform:translate(26px,4px);
  animation:mjWord .4s cubic-bezier(.2,.8,.25,1) 1.84s forwards}
.mjfx-splash .mj-word2{opacity:0;transform:translateY(15px);
  animation:mjWord .4s cubic-bezier(.2,.8,.25,1) 1.96s forwards}
@keyframes mjWord{to{opacity:1;transform:translate(0,0)}}

.mjfx-splash .mj-sweepMove{opacity:0;animation:mjSweepAnim .42s ease-in-out 2.32s}
@keyframes mjSweepAnim{0%{opacity:0;transform:translateX(0)}25%{opacity:1}100%{opacity:0;transform:translateX(560px)}}

/* Reduced motion: no sequence — the finished logo just fades in. */
@media (prefers-reduced-motion: reduce){
  .mjfx-splash *{animation:none !important}
  .mjfx-splash{animation:none}
  .mjfx-splash .mj-trace{stroke-dashoffset:0}
  .mjfx-splash .mj-node,.mjfx-splash .mj-gearPop,.mjfx-splash .mj-arrowLaunch,
  .mjfx-splash .mj-word1,.mjfx-splash .mj-word2{opacity:1;transform:none}
  .mjfx-splash .mj-glow{opacity:.45}
  .mjfx-splash .mj-spark,.mjfx-splash .mj-ring,.mjfx-splash .mj-streak,.mjfx-splash .mj-sweepMove{opacity:0}
  .mjfx-splash svg{animation:mjRmFade .3s ease-out}
}
@keyframes mjRmFade{from{opacity:0}to{opacity:1}}
      `}</style>
    </div>
  );
}
