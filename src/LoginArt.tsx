/** A quiet study of an IT shop counter. Colors follow the login page's theme. */
export function LoginArt() {
  return <svg className="login-counter-art" viewBox="0 0 500 270" fill="none" aria-hidden="true" focusable="false">
    <circle className="login-art-wash" cx="252" cy="126" r="108"/>
    <path className="login-art-guide" d="M18 244h464M252 8v15M252 251v11"/>

    {/* Desktop tower. */}
    <g className="login-art-outline">
      <path className="login-art-side" d="m38 97 14-9h43v137H52l-14-9z"/>
      <path className="login-art-paper" d="M52 88h43v137H52z"/>
      <path d="M61 104h25m-25 6h25m-25 8h25M61 185h25m-25 6h25m-25 6h25"/>
      <circle cx="73.5" cy="211" r="3"/>
      <path d="M52 225v8m43-8v8"/>
    </g>

    {/* Monitor with a spare, geometric counter screen. */}
    <g className="login-art-outline">
      <rect className="login-art-paper" x="110" y="45" width="220" height="143" rx="4"/>
      <rect className="login-art-screen" x="119" y="54" width="202" height="117" rx="1"/>
      <path className="login-art-green" d="M128 162v-45a45 45 0 0 1 90 0v45z" stroke="none"/>
      <path className="login-art-screen" d="M148 162v-34a25 25 0 0 1 50 0v34z" stroke="none"/>
      <path className="login-art-detail" d="M237 83h62m-62 9h38M237 112h62m-62 11h62m-62 11h44"/>
      <path className="login-art-accent-line" d="M237 153h62"/>
      <path d="M110 179h220m-124 9-4 34m32-34 4 34"/>
      <path className="login-art-paper" d="m190 222-7 7h74l-7-7z"/>
      <circle cx="220" cy="179" r="1.5" stroke="none" fill="currentColor"/>
    </g>

    {/* Keyboard and mouse. */}
    <g className="login-art-outline">
      <path className="login-art-paper" d="m116 232-7 12h182l-7-12z"/>
      <path className="login-art-detail" d="M126 237h148m-142 4h34m9 0h58m9 0h26"/>
      <path className="login-art-paper" d="M309 241v-5a12 12 0 0 1 24 0v5a3 3 0 0 1-3 3h-18a3 3 0 0 1-3-3z"/>
      <path d="M321 225v8"/>
    </g>

    {/* Receipt printer: the shop's hardware meets its daily accounts. */}
    <g className="login-art-outline">
      <path className="login-art-paper" d="M367 104h58v61h-58z"/>
      <path className="login-art-detail" d="M377 118h24m-24 9h38m-38 8h38m-38 8h22"/>
      <path className="login-art-side" d="m350 165 12-16h75l12 16v52h-99z"/>
      <rect className="login-art-paper" x="350" y="165" width="99" height="52" rx="3"/>
      <path d="M363 180h73M359 208h-2m85 0h-2"/>
      <circle className="login-art-green" cx="434" cy="173" r="2" stroke="none"/>
      <path className="login-art-paper" d="M371 180h56v63l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z"/>
      <path className="login-art-detail" d="M381 194h36m-36 8h36m-36 8h22"/>
      <path className="login-art-accent-line" d="M381 224h36"/>
    </g>
  </svg>
}
