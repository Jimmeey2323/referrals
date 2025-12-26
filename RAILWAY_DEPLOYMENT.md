# Railway Deployment Guide - Referral Rewards Processor

This guide will help you deploy the optimized referral rewards processing system to Railway for automated daily execution.

## 🚀 Deployment Steps

### 1. Prepare Your Repository

```bash
# Initialize git repository (if not already done)
git init
git add .
git commit -m "Initial commit: Referral rewards processor"

# Push to GitHub
git remote add origin https://github.com/yourusername/referral-rewards-processor.git
git push -u origin main
```

### 2. Deploy to Railway

1. **Visit Railway**: Go to [https://railway.app](https://railway.app)
2. **Sign Up/Login**: Use your GitHub account
3. **New Project**: Click "New Project" → "Deploy from GitHub repo"
4. **Select Repository**: Choose your referral-rewards-processor repository
5. **Automatic Detection**: Railway will detect the Dockerfile and configure automatically

### 3. Configure Environment Variables

In your Railway project dashboard, go to **Variables** tab and add:

#### Required Variables:
```bash
MOMENCE_ALL_COOKIES=your_momence_cookies_here
MOMENCE_HOST_ID=13752
REFERRAL_MEMBERSHIP_ID=583035
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key_here
SUPABASE_TABLE=referral_rewards
NODE_ENV=production
```

#### Optional Variables:
```bash
CRON_SCHEDULE=0 22 * * *
LOG_LEVEL=info
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### 4. Deploy and Monitor

1. **Deploy**: Railway will automatically build and deploy
2. **Check Health**: Visit `https://your-app.railway.app/health`
3. **Monitor Logs**: Use Railway's Logs tab to monitor execution

## ⏰ Scheduling

The application runs with these schedules:

- **Default**: Daily at 10:00 PM IST (`0 22 * * *`)
- **Custom**: Set `CRON_SCHEDULE` environment variable

### Cron Format Examples:
```bash
# Every day at 10 PM IST
CRON_SCHEDULE="0 22 * * *"

# Every day at 9 AM IST  
CRON_SCHEDULE="0 9 * * *"

# Every Monday at 8 PM IST
CRON_SCHEDULE="0 20 * * 1"

# Every 6 hours
CRON_SCHEDULE="0 */6 * * *"
```

## 🔧 Production Optimizations

### Performance Improvements:
- ✅ Reduced API timeouts for faster execution
- ✅ Optimized polling intervals
- ✅ Production logging with timestamps
- ✅ Error handling with webhook notifications
- ✅ Health check endpoint for monitoring

### Security Features:
- ✅ Non-root Docker container
- ✅ Environment-based configuration
- ✅ Secure secret management
- ✅ Input validation

### Reliability Features:
- ✅ Automatic retries with exponential backoff
- ✅ Graceful shutdown handling
- ✅ Comprehensive error logging
- ✅ Database constraint protection

## 📊 Monitoring

### Health Check:
```bash
curl https://your-app.railway.app/health
```

### Expected Response:
```json
{
  "status": "healthy",
  "service": "referral-rewards-scheduler", 
  "uptime": 3600.234,
  "timestamp": "2025-12-26T18:30:00.000Z"
}
```

### Log Monitoring:
- **Railway Dashboard**: Real-time logs in the Railway interface
- **Error Notifications**: Configure `WEBHOOK_URL` for Slack/Discord alerts

## 🛠 Local Development

```bash
# Install dependencies
npm install

# Run once for testing
npm run dev

# Run scheduler locally
npm run schedule
```

## 📋 Maintenance

### Update Deployment:
```bash
git add .
git commit -m "Update referral processor"
git push
# Railway automatically redeploys
```

### Environment Updates:
- Update variables in Railway dashboard
- Application automatically restarts with new values

### Scaling:
- Railway automatically handles scaling based on usage
- No additional configuration needed for this scheduled service

## 🔍 Troubleshooting

### Common Issues:

1. **Cookies Expired**: Update `MOMENCE_ALL_COOKIES` in Railway variables
2. **Supabase Connection**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
3. **Schedule Not Running**: Check `CRON_SCHEDULE` format and timezone
4. **Health Check Failing**: Verify Railway assigned `PORT` variable

### Debug Commands:
```bash
# Test single execution
NODE_ENV=production node referral-rewards-processor.js

# Check scheduler
NODE_ENV=production node scheduler.js
```

## 💰 Cost Estimate

**Railway Pricing**:
- **Hobby Plan**: $5/month (recommended)
- **Usage**: Minimal resource usage (runs ~5-10 minutes daily)
- **Data Transfer**: Negligible for API calls and database updates

The scheduled service is very lightweight and should stay well within Railway's free tier limits for development/testing.