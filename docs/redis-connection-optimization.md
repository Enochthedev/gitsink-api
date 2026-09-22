# Redis Connection Optimization Guide

## Problem Summary

The application was experiencing "ERR max number of clients reached" errors due to excessive Redis connections being created. This document explains the fixes and provides monitoring guidance.

## Root Cause

### Before Optimization
The application was creating approximately **50+ Redis connections**:

1. **Queue Producers**: 1 shared connection ✅
2. **QueueEvents**: 6 separate connections (1 per queue type) ❌
3. **Workers**: ~42 connections ❌
   - Each worker creates 2 connections (blocking + command)
   - High concurrency multiplied this: 6 queue types × ~5 avg concurrency × 2 = 60 connections
4. **Cache Service**: 1 connection
5. **Health checks/metrics**: Additional connections

**Total**: 50+ connections, exceeding Railway/Upstash free tier limits (typically 30-50 connections)

## Solutions Implemented

### 1. QueueEvents Connection Sharing (queue-manager.service.ts)
**Before**: Each QueueEvents instance created a new connection
```typescript
const queueEvents = new QueueEvents(queueType, {
  connection: queueOptions.connection, // Created NEW connection
});
```

**After**: Reuse the singleton connection
```typescript
const queueEvents = new QueueEvents(queueType, {
  connection: this.queueConfig.getRedisConnection(), // Reuse singleton
});
```
**Savings**: -6 connections

### 2. Reduced Worker Concurrency (queue.config.ts)
**Before**: Default concurrency of 5, with some queues going up to 7
- Total worker connections: ~42

**After**: Conservative concurrency settings
- Email: 2 workers (was 5) → 4 connections (was 10)
- Sync: 2 workers (was 3) → 4 connections (was 6)
- AI Enrichment: 1 worker (was 2) → 2 connections (was 4)
- Webhook: 3 workers (was 7) → 6 connections (was 14)
- Cleanup: 1 worker → 2 connections
- Analytics: 1 worker (was 3) → 2 connections (was 6)

**Total worker connections**: ~20 (was ~42)
**Savings**: -22 connections

### 3. Enhanced Connection Configuration
Added better connection management settings:
- Connection timeouts
- Retry strategies
- Keep-alive settings
- Connection monitoring and logging

## New Connection Count

### After Optimization
1. **Queue Producers**: 1 shared connection
2. **QueueEvents**: REUSES the 1 shared connection (no additional connections)
3. **Workers**: ~20 connections (down from ~42)
4. **Cache Service**: 1 connection
5. **Misc**: ~3-5 connections

**Total**: ~25-27 connections (down from 50+)
**Reduction**: ~50% fewer connections

## Environment Variables for Fine-Tuning

You can further adjust concurrency via environment variables:

```env
# Global default (applied to all queues unless overridden)
QUEUE_CONCURRENCY=2

# Per-queue concurrency overrides
EMAIL_QUEUE_CONCURRENCY=2
SYNC_QUEUE_CONCURRENCY=2
AI_QUEUE_CONCURRENCY=1
WEBHOOK_QUEUE_CONCURRENCY=3
ANALYTICS_QUEUE_CONCURRENCY=1

# Redis configuration
REDIS_URL=redis://...
# Or individual settings:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0
```

## Monitoring Redis Connections

### Using Redis CLI
```bash
# Connect to your Redis instance
redis-cli -h <host> -p <port> -a <password>

# Check current client connections
CLIENT LIST

# Count connected clients
INFO clients
```

### Expected Output
You should see approximately 25-27 client connections when the app is running normally.

### Watch for Issues
- **High connection count**: If you see 40+ connections, there may be a connection leak
- **"max number of clients reached"**: Increase Redis max connections or reduce worker concurrency
- **Connection churn**: Frequent connect/disconnect indicates instability

## Scaling Guidance

### If you need more throughput:

1. **First**: Check if your current workers are actually busy
   ```bash
   # Check queue metrics
   curl http://localhost:3000/health/queues
   ```

2. **Then**: Increase concurrency incrementally
   - Start with +1 worker per queue type
   - Monitor Redis connection count
   - Each +1 worker = +2 Redis connections

3. **Or**: Upgrade your Redis plan
   - Railway: Upgrade to Pro plan for more connections
   - Upstash: Upgrade tier for higher connection limits

### Connection Limit Calculation
```
Max safe concurrency = (Redis max connections - 10) / (num_queue_types * 2)

Example:
- Redis limit: 50 connections
- Reserve: 10 for overhead
- Queue types: 6
- Max concurrency: (50 - 10) / (6 * 2) = 3.3 → 3 workers per queue
```

## Performance Impact

The reduced concurrency should have minimal performance impact because:

1. **I/O Bound**: Most queue jobs (email, sync, webhooks) are I/O bound, not CPU bound
   - Workers spend most time waiting for external services
   - 2-3 workers can handle significant throughput

2. **Intelligent Queuing**: Jobs are queued and processed in order
   - No jobs are lost, just processed sequentially
   - Priority system ensures important jobs go first

3. **Async Processing**: The app doesn't wait for queue jobs to complete
   - Response times to users are unaffected
   - Jobs process in the background

## Testing the Fixes

1. **Deploy the changes**:
   ```bash
   git add .
   git commit -m "fix(redis): optimize connection pooling and reduce worker concurrency"
   git push
   ```

2. **Monitor the logs** for:
   ```
   [QueueConfig] Shared Redis connection established
   [QueueConfig] Shared Redis connection ready
   ```

3. **Check for errors**: You should NO LONGER see:
   ```
   ERR max number of clients reached
   Failed to check email queue health
   Worker error:
   ```

4. **Verify queue operations**:
   - Test user signup (email queue)
   - Test project sync (sync queue)
   - All should work without Redis connection errors

## Rollback Plan

If issues arise, you can temporarily increase concurrency via environment variables:

```env
QUEUE_CONCURRENCY=5
EMAIL_QUEUE_CONCURRENCY=5
SYNC_QUEUE_CONCURRENCY=3
WEBHOOK_QUEUE_CONCURRENCY=5
```

This will increase connections but may hit limits again. Better to:
1. Upgrade Redis plan
2. Investigate specific bottlenecks
3. Consider worker scaling strategies

## Future Improvements

For even better connection management, consider:

1. **Connection Pooling Library**: Use a dedicated Redis connection pool
2. **Worker Clustering**: Run workers in separate processes/containers
3. **Redis Cluster**: Distribute load across multiple Redis instances
4. **Queue Sharding**: Split high-volume queues across Redis instances
5. **Metrics Dashboard**: Add Prometheus/Grafana for connection monitoring

## Support

If you continue experiencing Redis connection issues:

1. Check Redis plan limits (Railway/Upstash dashboard)
2. Review application logs for connection patterns
3. Consider upgrading Redis tier
4. Reach out with `CLIENT LIST` output and queue metrics
