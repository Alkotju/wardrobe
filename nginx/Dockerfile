FROM nginx:1.27-alpine

# Build context is the repo root (see docker-compose.yml) so we can pull in
# both the nginx config + certs and the static frontend in a single image.
COPY nginx/nginx.conf        /etc/nginx/nginx.conf
COPY nginx/certs/            /etc/nginx/certs/

# Only the runtime SPA assets — frontend/{tests,package.json,jest.config.js}
# are dev-only and shouldn't be publicly served.
COPY frontend/index.html     /usr/share/nginx/html/index.html
COPY frontend/js/            /usr/share/nginx/html/js/
COPY frontend/styles/        /usr/share/nginx/html/styles/

EXPOSE 80 443
