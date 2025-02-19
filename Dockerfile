FROM node:18-alpine
# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.1 --activate
WORKDIR /app
# Copy package files
COPY package.json pnpm-lock.yaml ./
# Install dependencies (removed --frozen-lockfile flag)
RUN pnpm install
# Copy rest of the application
COPY . .
# Create feeds directory
RUN mkdir -p feeds
# Expose port
EXPOSE 3000
# Start the application
CMD ["pnpm", "start"]
