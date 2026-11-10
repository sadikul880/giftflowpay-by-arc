# Included by every served location, because nginx drops server-level add_header lines once a location sets its own.
# The app is a static bundle with no inline scripts, so scripts may only come from our own origin. Styles allow inline
# rules (wallet modal and animations) and Google Fonts. connect-src is https/wss because the app talks to public Arc
# RPCs, the block explorer API and Circle/LiFi services chosen at runtime. frame-ancestors stops other sites from
# framing the app (clickjacking on approve and claim buttons).
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
