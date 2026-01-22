#!/bin/bash

# SW-WCD Research Setup Script
# Sets up local HTTPS development environment

set -e

echo " Setting up SW-WCD Research Environment..."

# Check for required commands
for cmd in node npm docker docker-compose; do
    if ! command -v $cmd &> /dev/null; then
        echo " Error: $cmd is required but not installed."
        exit 1
    fi
done

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo " Error: Node.js $REQUIRED_VERSION or higher is required. Current: $NODE_VERSION"
    exit 1
fi

echo " Node.js version check passed: $NODE_VERSION"

# Create necessary directories
echo " Creating directory structure..."
mkdir -p logs
mkdir -p ssl
mkdir -p test-results

# Install dependencies
echo "Installing dependencies..."
cd origin && npm install && cd ..
cd tests && npm install && cd ..

# Setup local SSL certificates
echo " Setting up local SSL certificates..."

if ! command -v mkcert &> /dev/null; then
    echo " Installing mkcert..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install mkcert
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt update && sudo apt install -y libnss3-tools
        wget -O mkcert https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64
        chmod +x mkcert
        sudo mv mkcert /usr/local/bin/
    else
        echo " Unsupported OS for mkcert auto-install. Please install manually."
        exit 1
    fi
fi

echo " Generating SSL certificates..."
mkcert -install
mkcert -key-file ssl/key.pem -cert-file ssl/cert.pem \
    localhost \
    127.0.0.1 \
    cdn-simulator.local \
    cf-test.yourdomain.com \
    fastly-test.yourdomain.com \
    aws-test.yourdomain.com

echo " SSL certificates generated in ssl/ directory"

# Setup database
echo " Setting up database..."
docker-compose -f infrastructure/docker-compose.yml up -d

# Wait for database to be ready
echo " Waiting for database to be ready..."
until docker exec infrastructure-postgres-1 pg_isready -U swwcd -d swwcdresearch; do sleep 1; 
#until docker exec sw-wcd-v4-research-postgres-1 pg_isready -U swwcd -d swwcd_research; do
 #   sleep 1
done

# Initialize database schema
echo " Initializing database schema..."
node scripts/init-db.js

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo " Creating .env file from template..."
    cp .env.example .env
    echo "  Please edit .env file with your actual domain names and settings"
fi

echo ""
echo " Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your domain names"
echo "2. Run: npm run infra:up"
echo "3. Run: npm run dev"
echo "4. Run: npm run test:local"
echo ""
echo "For production CDN testing:"
echo "1. Configure your CDN accounts"
echo "2. Update DNS records for your test domains"
echo "3. Run: npm run test:cloudflare (or fastly/cloudfront)"
echo ""
echo "Safety reminder: Only test on domains you own!"