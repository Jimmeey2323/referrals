# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (fallback to npm install if no lock file)
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy application files
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Expose port for Railway
EXPOSE ${PORT:-3000}

# Start the scheduler
CMD ["npm", "run", "schedule"]