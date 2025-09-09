#!/bin/bash
# Sales Automation System Deployment Script for VPS

set -e

echo "🚀 Sales Automation System - VPS Deployment Script"
echo "=================================================="

# Configuration
PROJECT_NAME="sales-automation-system"
PROJECT_DIR="/opt/$PROJECT_NAME"
REPO_URL="https://github.com/kadotani/sales-automation-system.git"  # Update with your actual repo URL
PM2_APP_NAME="sales-automation"
NGINX_CONF_PATH="/etc/nginx/sites-available/default"  # Adjust based on your nginx setup

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

print_status "Starting deployment process..."

# Step 1: Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Step 2: Install required dependencies
print_status "Installing required dependencies..."
apt install -y curl git nginx

# Step 3: Install Node.js 18+ (if not already installed)
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    print_status "Node.js already installed: $(node --version)"
fi

# Step 4: Install PM2 globally (if not already installed)
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    npm install -g pm2
else
    print_status "PM2 already installed: $(pm2 --version)"
fi

# Step 5: Create project directory
print_status "Setting up project directory..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# Step 6: Clone or update repository
if [ ! -d ".git" ]; then
    print_status "Cloning repository..."
    git clone $REPO_URL .
else
    print_status "Updating repository..."
    git pull origin main
fi

# Step 7: Install dependencies
print_status "Installing Node.js dependencies..."
npm install --production

# Step 8: Copy environment file
print_status "Setting up environment variables..."
if [ -f ".env.production" ]; then
    cp .env.production .env.local
    print_status "Environment file copied"
else
    print_warning "No .env.production file found. Please create one manually."
fi

# Step 9: Build the application
print_status "Building Next.js application..."
npm run build:production

# Step 10: Set up PM2
print_status "Setting up PM2 application..."
pm2 stop $PM2_APP_NAME 2>/dev/null || true
pm2 delete $PM2_APP_NAME 2>/dev/null || true
pm2 start ecosystem.config.js --env production

# Step 11: Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save
pm2 startup systemd -u root --hp /root

# Step 12: Set proper permissions
print_status "Setting proper permissions..."
chown -R www-data:www-data $PROJECT_DIR
chmod -R 755 $PROJECT_DIR

# Step 13: Create PM2 log directory
print_status "Setting up PM2 logs..."
mkdir -p /var/log/pm2
chown -R www-data:www-data /var/log/pm2

# Step 14: Nginx configuration reminder
print_warning "Manual Step Required: Update Nginx Configuration"
echo "1. Edit your nginx configuration file (usually /etc/nginx/sites-available/default)"
echo "2. Add the sales automation proxy configuration from nginx-sales.conf"
echo "3. Test nginx configuration: nginx -t"
echo "4. Reload nginx: systemctl reload nginx"
echo ""

# Step 15: Show status
print_status "Deployment completed! Checking application status..."
pm2 status
pm2 logs $PM2_APP_NAME --lines 10

print_status "Sales Automation System deployed successfully!"
echo ""
echo "📊 Application Details:"
echo "   - URL: https://feer-n8n.xvps.jp/sales/"
echo "   - Port: 3001"
echo "   - PM2 App: $PM2_APP_NAME"
echo "   - Project Dir: $PROJECT_DIR"
echo ""
echo "🔧 Next Steps:"
echo "1. Update Nginx configuration manually"
echo "2. Test the application at https://feer-n8n.xvps.jp/sales/"
echo "3. Set up cron jobs for automation (if needed)"
echo ""
echo "📝 Useful Commands:"
echo "   pm2 restart $PM2_APP_NAME    # Restart application"
echo "   pm2 logs $PM2_APP_NAME       # View logs"
echo "   pm2 monit                    # Monitor processes"