'use strict';

// CloudFront viewer-request function attached to the docs.prometheux.ai distribution.
// Rewrites extensionless / trailing-slash paths to /index.html so the
// Mintlify static export (directory-style /<page>/index.html) is served
// correctly.
//
// Examples:
//   /                                            -> /index.html
//   /platform/data-connections                   -> /platform/data-connections/index.html
//   /platform/data-connections/                  -> /platform/data-connections/index.html
//   /sitemap.xml                                 -> unchanged
//   /img/logo.svg                                -> unchanged
//
// Deployed automatically by .github/workflows/deploy.yml on every push to main.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    if (uri === '/') {
        request.uri = '/index.html';
    } else if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (!uri.includes('.')) {
        request.uri += '/index.html';
    }

    return request;
}
