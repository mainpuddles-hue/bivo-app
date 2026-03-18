#!/bin/bash
set -e

echo "Building web export..."
npx expo export --platform web --output-dir dist --clear

echo "Copying PWA assets..."
cp public/manifest.json dist/
cp public/sw.js dist/
cp public/icon-192.png dist/
cp public/icon-512.png dist/

echo "Injecting PWA meta tags into index.html..."
sed -i '' 's|</head>|<link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#F5F4F0"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"></head>|' dist/index.html

echo "Adding Vercel config for SPA routing..."
cat > dist/vercel.json << 'JSON'
{
  "rewrites": [
    { "source": "/sw.js", "destination": "/sw.js" },
    { "source": "/manifest.json", "destination": "/manifest.json" },
    { "source": "/icon-192.png", "destination": "/icon-192.png" },
    { "source": "/icon-512.png", "destination": "/icon-512.png" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
JSON

echo "Deploying to Vercel..."
cd dist && npx vercel --prod --yes --scope mainpuddles-5622s-projects

echo "Done!"
