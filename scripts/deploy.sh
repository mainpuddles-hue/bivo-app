#!/bin/bash
set -e

echo "Building web export..."
npx expo export --platform web --output-dir dist --clear

echo "Adding Vercel config for SPA routing..."
cat > dist/vercel.json << 'JSON'
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
JSON

echo "Deploying to Vercel..."
cd dist && npx vercel --prod --yes --scope mainpuddles-5622s-projects

echo "Done!"
