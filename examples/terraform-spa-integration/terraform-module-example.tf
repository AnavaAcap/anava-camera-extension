# Example Terraform module for enabling Anava Local Connector in terraform-spa projects
# This shows how to integrate the Chrome extension with any terraform-spa deployment

variable "enable_spa_connector" {
  type        = bool
  description = "Enable Chrome extension connector features"
  default     = false
}

variable "extension_id" {
  type        = string
  description = "Chrome extension ID to whitelist (get from Chrome Web Store after publishing)"
  default     = ""

  validation {
    condition     = var.extension_id == "" || can(regex("^[a-p]{32}$", var.extension_id))
    error_message = "Extension ID must be a 32-character lowercase alphanumeric string."
  }
}

variable "website_bucket_id" {
  type        = string
  description = "S3 bucket ID for website hosting"
}

variable "api_gateway_url" {
  type        = string
  description = "API Gateway URL for backend communication"
}

variable "project_id" {
  type        = string
  description = "Project identifier"
}

# Create well-known configuration endpoint for extension auto-discovery
resource "aws_s3_object" "connector_config" {
  count  = var.enable_spa_connector ? 1 : 0
  bucket = var.website_bucket_id
  key    = ".well-known/spa-connector-config.json"

  content = jsonencode({
    version      = "1.0"
    extensionId  = var.extension_id
    backendUrl   = var.api_gateway_url
    projectId    = var.project_id
    features     = ["camera-discovery", "acap-deployment"]
  })

  content_type = "application/json"
  acl          = "public-read"

  # Allow cross-origin requests from extension
  metadata = {
    "Access-Control-Allow-Origin" = "*"
  }
}

# CloudFront distribution behavior for .well-known directory
resource "aws_cloudfront_distribution" "spa_distribution" {
  # ... existing distribution config ...

  # Add ordered cache behavior for .well-known endpoint
  ordered_cache_behavior {
    path_pattern     = ".well-known/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-spa-bucket"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
      headers = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 300
    max_ttl                = 600
    compress               = true
  }
}

# Optional: API Gateway endpoint for nonce authentication
resource "aws_api_gateway_resource" "extension_auth" {
  count       = var.enable_spa_connector ? 1 : 0
  rest_api_id = var.api_gateway_id
  parent_id   = var.api_gateway_root_resource_id
  path_part   = "extension-auth"
}

resource "aws_api_gateway_method" "extension_auth_post" {
  count         = var.enable_spa_connector ? 1 : 0
  rest_api_id   = var.api_gateway_id
  resource_id   = aws_api_gateway_resource.extension_auth[0].id
  http_method   = "POST"
  authorization = "NONE"
}

# Outputs
output "connector_config_url" {
  value       = var.enable_spa_connector ? "https://${var.cloudfront_domain}/.well-known/spa-connector-config.json" : null
  description = "Public URL for extension configuration discovery"
}

output "extension_auth_endpoint" {
  value       = var.enable_spa_connector ? "${var.api_gateway_url}/extension-auth" : null
  description = "Backend endpoint for extension authentication"
}
