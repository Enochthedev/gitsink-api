# GitSink API Documentation

This directory contains the complete documentation system for the GitSink API, including automated generation, validation, versioning, and deployment tools.

## 📚 Documentation Structure

```
docs/
├── api/                          # Hand-written API guides
│   ├── authentication-guide.md   # Authentication methods and examples
│   ├── projects-guide.md         # Projects API comprehensive guide
│   ├── graphql-guide.md          # GraphQL API documentation
│   └── quick-start.md            # Getting started guide
├── generated/                    # Auto-generated documentation
│   ├── openapi.json             # OpenAPI specification (JSON)
│   ├── openapi.yaml             # OpenAPI specification (YAML)
│   ├── index.html               # Interactive Swagger UI
│   └── examples/                # SDK examples and code samples
├── versions/                     # Versioned documentation
│   ├── index.json              # Version index
│   ├── README.md               # Version overview
│   └── v1.0.0/                 # Specific version directory
├── api-reference.md             # Quick API reference
├── CHANGELOG.md                 # Documentation changelog
└── README.md                    # This file
```

## 🚀 Quick Start

### Generate Documentation

```bash
# Generate all documentation formats
npm run docs:generate

# Generate specific format
npm run docs:generate -- --format html
npm run docs:generate -- --format yaml --version 2.0.0

# Generate without examples
npm run docs:generate -- --no-examples
```

### Validate Documentation

```bash
# Run all validations
npm run docs:validate

# Validate with external link checking
npm run docs:validate -- --check-links

# Generate validation report
npm run docs:validate -- --format json --output validation-report.json
```

### Version Documentation

```bash
# Create new version
npm run docs:version create

# Create specific version
npm run docs:version create -- --version 2.1.0

# List all versions
npm run docs:version list

# Cleanup old versions (keep 5 most recent)
npm run docs:version cleanup 5
```

### Deploy Documentation

```bash
# Deploy locally
npm run docs:deploy

# Deploy to GitHub Pages
npm run docs:deploy -- --target github-pages --environment production

# Deploy to S3
npm run docs:deploy -- --target s3 --bucket my-docs-bucket --region us-west-2

# Dry run deployment
npm run docs:deploy -- --dry-run --verbose
```

### Maintain Documentation

```bash
# Run all maintenance tasks
npm run docs:maintain run

# Run specific tasks
npm run docs:maintain run -- --tasks update-examples,validate-links

# List available tasks
npm run docs:maintain list

# Dry run maintenance
npm run docs:maintain run -- --dry-run
```

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `docs:generate` | Generate OpenAPI specs and examples |
| `docs:validate` | Validate documentation quality |
| `docs:version` | Create and manage documentation versions |
| `docs:deploy` | Deploy documentation to various targets |
| `docs:maintain` | Run maintenance tasks |
| `docs:build` | Generate and validate (CI-friendly) |
| `docs:dev` | Generate and serve locally |
| `docs:clean` | Clean generated files |

## 📋 Documentation Generation

The documentation system automatically generates:

### OpenAPI Specification
- **JSON format**: Machine-readable API specification
- **YAML format**: Human-readable API specification  
- **HTML format**: Interactive Swagger UI documentation

### Code Examples
- **JavaScript/Node.js**: Complete SDK with examples
- **Python**: SDK with type hints and examples
- **cURL**: Shell scripts for testing
- **Postman Collection**: Import-ready API collection

### Guides and Tutorials
- **Quick Start**: 5-minute getting started guide
- **Authentication**: Comprehensive auth guide
- **Projects API**: Detailed projects documentation
- **GraphQL**: Complete GraphQL reference

## 🔍 Documentation Validation

The validation system checks:

### Content Quality
- ✅ OpenAPI specification validity
- ✅ Markdown syntax and structure
- ✅ Code example syntax
- ✅ Internal link integrity
- ✅ External link availability (optional)
- ✅ Spelling and grammar

### Technical Accuracy
- ✅ API endpoint availability
- ✅ Schema consistency
- ✅ Example code execution
- ✅ Authentication flows

### Output Formats
- **Text**: Human-readable report
- **JSON**: Machine-readable results
- **JUnit XML**: CI/CD integration

## 📦 Documentation Versioning

### Version Management
- **Automatic versioning**: Based on package.json or git tags
- **Archive creation**: Compressed version snapshots
- **Index maintenance**: Searchable version catalog
- **Cleanup automation**: Remove old versions automatically

### Version Structure
Each version contains:
- Complete API documentation
- Interactive Swagger UI
- Code examples and guides
- Postman collection
- Version metadata and changelog

### Version Access
- **Latest**: Always points to current version
- **Specific**: Access any historical version
- **Comparison**: Diff between versions
- **Migration**: Upgrade guides between versions

## 🚀 Documentation Deployment

### Supported Targets

#### GitHub Pages
```bash
npm run docs:deploy -- --target github-pages --branch gh-pages
```
- Automatic Jekyll bypass
- Custom domain support
- Branch-based deployment

#### AWS S3
```bash
npm run docs:deploy -- --target s3 --bucket docs-bucket --region us-east-1
```
- Static website hosting
- CloudFront integration
- Custom domain support

#### Netlify
```bash
npm run docs:deploy -- --target netlify
```
- Continuous deployment
- Branch previews
- Form handling

#### Vercel
```bash
npm run docs:deploy -- --target vercel
```
- Edge network deployment
- Serverless functions
- Analytics integration

#### Local
```bash
npm run docs:deploy -- --target local --output-dir ./public
```
- Local development
- Custom server integration
- Offline documentation

### Deployment Features
- **Pre-deployment validation**: Ensure quality before deploy
- **Rollback capability**: Revert to previous versions
- **Environment management**: Production, staging, development
- **Custom domains**: Configure custom URLs
- **Analytics integration**: Track documentation usage

## 🔧 Documentation Maintenance

### Automated Tasks

#### Daily Tasks
- **Update Examples**: Sync code examples with API changes
- **Update Changelog**: Add recent documentation commits
- **Generate Sitemap**: Update search engine sitemap
- **Check Spelling**: Validate content quality
- **Update Metrics**: Track documentation statistics

#### Weekly Tasks
- **Validate Links**: Check external link availability
- **Cleanup Versions**: Remove old documentation versions
- **Optimize Images**: Compress and optimize images

### Manual Maintenance
```bash
# Run specific maintenance tasks
npm run docs:maintain run -- --tasks update-examples,validate-links

# Check what would be done
npm run docs:maintain run -- --dry-run

# Force execution despite errors
npm run docs:maintain run -- --force
```

## 📊 Documentation Metrics

The system tracks:

### Content Metrics
- Number of documentation files
- Total documentation size
- Last update timestamps
- Version count and history

### Quality Metrics
- Validation pass/fail rates
- Broken link counts
- Spelling error counts
- Code example test results

### Usage Metrics (when deployed)
- Page view statistics
- Popular documentation sections
- Search queries
- Download counts

## 🔧 Configuration

### Environment Variables

```bash
# AWS S3 Deployment
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# GitHub Pages
GITHUB_TOKEN=your_github_token

# Analytics (optional)
GA_MEASUREMENT_ID=your_google_analytics_id
```

### Custom Configuration

Create `.docsrc.json` in project root:

```json
{
  "title": "GitSink API Documentation",
  "description": "Complete API documentation for GitSink",
  "version": "1.0.0",
  "baseUrl": "https://docs.gitsink.com",
  "contact": {
    "name": "GitSink Support",
    "email": "support@gitsink.com",
    "url": "https://gitsink.com/support"
  },
  "license": {
    "name": "MIT",
    "url": "https://opensource.org/licenses/MIT"
  },
  "servers": [
    {
      "url": "https://api.gitsink.com",
      "description": "Production"
    },
    {
      "url": "https://staging-api.gitsink.com", 
      "description": "Staging"
    }
  ],
  "deployment": {
    "target": "github-pages",
    "branch": "gh-pages",
    "domain": "docs.gitsink.com"
  },
  "maintenance": {
    "schedule": {
      "update-examples": "0 2 * * *",
      "validate-links": "0 6 * * 1",
      "cleanup-versions": "0 3 * * 0"
    },
    "keepVersions": 10
  }
}
```

## 🚨 Troubleshooting

### Common Issues

#### Generation Fails
```bash
# Check NestJS application starts correctly
npm run start:dev

# Verify all dependencies are installed
npm install

# Check TypeScript compilation
npm run build
```

#### Validation Errors
```bash
# Run validation with verbose output
npm run docs:validate -- --verbose

# Check specific validation categories
npm run docs:validate -- --no-links --no-examples
```

#### Deployment Issues
```bash
# Test deployment locally first
npm run docs:deploy -- --target local --dry-run

# Check deployment credentials
npm run docs:deploy -- --dry-run --verbose
```

#### Maintenance Problems
```bash
# Run maintenance in dry-run mode
npm run docs:maintain run -- --dry-run

# Run specific tasks individually
npm run docs:maintain run -- --tasks update-examples
```

### Getting Help

1. **Check the logs**: Most scripts provide detailed error messages
2. **Run in verbose mode**: Add `--verbose` flag for detailed output
3. **Use dry-run mode**: Test operations with `--dry-run` flag
4. **Check dependencies**: Ensure all required tools are installed
5. **Validate configuration**: Check environment variables and config files

### Support Channels

- **GitHub Issues**: https://github.com/gitsink/api/issues
- **Documentation**: https://docs.gitsink.com
- **Email Support**: support@gitsink.com
- **Community**: https://github.com/gitsink/community

## 🤝 Contributing

### Adding New Documentation

1. **API Guides**: Add to `docs/api/` directory
2. **Code Examples**: Update generation scripts
3. **Validation Rules**: Extend validation scripts
4. **Maintenance Tasks**: Add to maintenance system

### Improving Automation

1. **Generation**: Enhance OpenAPI generation
2. **Validation**: Add new validation checks
3. **Deployment**: Support new deployment targets
4. **Maintenance**: Create new maintenance tasks

### Best Practices

- **Write clear documentation**: Use simple, concise language
- **Include examples**: Provide working code samples
- **Test thoroughly**: Validate all changes
- **Version properly**: Follow semantic versioning
- **Automate everything**: Reduce manual maintenance

## 📄 License

This documentation system is part of the GitSink project and is licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.

---

**Last Updated**: ${new Date().toLocaleDateString()}  
**Version**: 1.0.0  
**Maintainer**: GitSink Team