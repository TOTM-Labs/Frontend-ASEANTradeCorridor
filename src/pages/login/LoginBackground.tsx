// Sign-in background: the ATC globe (ASEAN facing, connected rings) as a looping animation, full screen behind the card.
// Asset: public/atc-login-bg-globe-loop.gif (approved design, 1024×576). People who ask their system to reduce motion
// get a soft still gradient instead of the moving picture.
import './LoginBackground.css';

export const LOGIN_BG = '/atc-login-bg-globe-loop.gif';

export function LoginBackground() {
  return (
    <div className="atc-bg" aria-hidden>
      <img className="atc-bg__globe" src={LOGIN_BG} alt="" decoding="async" />
      <div className="atc-bg__veil" />
    </div>
  );
}
