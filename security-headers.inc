# Included by every served location, because nginx drops server-level add_header lines once a location sets its own.
# frame-ancestors stops other sites from framing the app (clickjacking on approve and claim buttons).
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
