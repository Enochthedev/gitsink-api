# Redis Configuration for GitSink API

## Critical Redis Configuration Issues

### 1. Redis Eviction Policy

**Current Issue**: Redis is configured with `allkeys-lru` eviction policy, but BullMQ requires `noeviction`.

**Why this matters**:
- `allkeys-lru`: Redis evicts keys when memory is full, starting with least recently used keys
- `noeviction`: Redis refuses new writes when memory is full, returning errors instead
- BullMQ job data must persist until explicitly removed
- Evicting job keys can cause jobs to be lost or stuck
- Queue integrity depends on reliable key persistence

**Fix Redis Eviction Policy**:

```bash
# Connect to Redis CLI and run:
redis-cli CONFIG SET maxmemory-policy noeviction

# To make it permanent, add to redis.conf:
maxmemory-policy noeviction

# Also set appropriate memory limit (adjust based on your server):
maxmemory 2gb
```

### 2. BullMQ Redis Configuration

**Issue**: BullMQ requires `maxRetriesPerRequest: null` for proper operation.

**Why this matters**:
- BullMQ needs full control over retry behavior
- Setting `maxRetriesPerRequest` to a number can interfere with BullMQ's internal retry logic
- Can cause connection issues and job processing failures

**Fixed in Code**:
- ✅ `src/app.module.ts` - BullModule.forRoot configuration
- ✅ `src/queues/config/queue.config.ts` - QueueConfigService
- ✅ `src/projects/sync-queue.service.ts` - Sync queue connections

## Redis Configuration Checklist

### Production Redis Settings

```conf
# redis.conf settings for production BullMQ usage

# Memory and Eviction
maxmemory 2gb                    # Adjust based on your server
maxmemory-policy noeviction      # Critical for BullMQ

# Persistence (choose one strategy)
# Option 1: RDB snapshots (good for most cases)
save 900 1                       # Save if at least 1 key changed in 900 seconds
save 300 10                      # Save if at least 10 keys changed in 300 seconds
save 60 10000                    # Save if at least 10000 keys changed in 60 seconds

# Option 2: AOF (better durability, higher disk usage)
appendonly yes
appendfsync everysec

# Network and Connection
timeout 300                      # Client idle timeout
tcp-keepalive 300               # TCP keepalive

# Performance
maxclients 10000                # Adjust based on expected connections
```

### Environment Variables

```env
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password
REDIS_DB=0
REDIS_URL=redis://localhost:6379

# Queue Configuration
QUEUE_CONCURRENCY=5
EMAIL_QUEUE_CONCURRENCY=5
SYNC_QUEUE_CONCURRENCY=3
WEBHOOK_QUEUE_CONCURRENCY=7
```

## Monitoring and Maintenance

### Check Redis Configuration

```bash
# Check current eviction policy
redis-cli CONFIG GET maxmemory-policy

# Check memory usage
redis-cli INFO memory

# Monitor Redis in real-time
redis-cli MONITOR

# Check queue status
redis-cli KEYS "bull:*"
```

### Queue Health Monitoring

The application includes built-in queue health monitoring:

- Health endpoint: `GET /health`
- Queue metrics: Available through the metrics module
- Queue cleanup: Automatic cleanup of completed/failed jobs

### Troubleshooting

**If jobs are getting lost**:
1. Check Redis eviction policy: `redis-cli CONFIG GET maxmemory-policy`
2. Check Redis memory usage: `redis-cli INFO memory`
3. Monitor Redis logs for eviction events
4. Check application logs for BullMQ errors

**If queues are stuck**:
1. Check Redis connection configuration
2. Verify `maxRetriesPerRequest: null` in all BullMQ configurations
3. Check worker processes are running
4. Monitor queue metrics for processing rates

## Security Considerations

1. **Redis Authentication**: Always use Redis AUTH in production
2. **Network Security**: Bind Redis to specific interfaces, use firewalls
3. **TLS**: Use Redis TLS for encrypted connections
4. **Regular Updates**: Keep Redis updated to latest stable version

## Performance Optimization

1. **Memory Management**: Monitor Redis memory usage and adjust `maxmemory`
2. **Connection Pooling**: BullMQ handles connection pooling automatically
3. **Job Cleanup**: Configure appropriate `removeOnComplete` and `removeOnFail` values
4. **Concurrency**: Tune worker concurrency based on your server resources

## Immediate Actions Required

1. ✅ **Fixed**: Update BullMQ Redis configurations to use `maxRetriesPerRequest: null`
2. 🔧 **Required**: Set Redis eviction policy to `noeviction`
3. 📊 **Recommended**: Monitor Redis memory usage and set appropriate limits
4. 🔍 **Recommended**: Check for any stuck or lost jobs after configuration changes

## Testing Configuration

After making changes, test the configuration:

```bash
# Test Redis connection
redis-cli ping

# Test BullMQ job processing
# (Use your application's job creation endpoints)

# Monitor queue processing
# (Check application logs and health endpoints)
```