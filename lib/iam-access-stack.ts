import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * IAM + SQS stack. Depends on netlumi-cdk-foundation (reads bucket name from SSM).
 *
 * Intentional misconfigs for detection testing:
 *   - IAM role: wildcard action + wildcard resource (overly permissive)
 *   - IAM role: no permission boundary
 *   - SQS queue: no encryption, no DLQ, message retention too long
 *   - IAM user with programmatic access (detection: IAM user access key)
 *
 * Exports role ARN to SSM for netlumi-cdk-compute dependency.
 */
export class IamAccessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Read foundation bucket name from SSM (cross-repo dependency)
    const foundationBucketName = ssm.StringParameter.valueForStringParameter(
      this, '/netlumi/e2e/foundation/bucket-name'
    );

    // IAM role — overly permissive (detection: iam wildcard policy)
    const appRole = new iam.Role(this, 'AppRole', {
      roleName: 'netlumi-e2e-app-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Netlumi E2E test application role',
      // MISCONFIGURED: no permission boundary
    });

    // Wildcard policy — triggers detection (over-permissive IAM)
    appRole.addToPolicy(new iam.PolicyStatement({
      sid: 'OverlyBroadS3Access',
      effect: iam.Effect.ALLOW,
      actions: ['s3:*'],              // MISCONFIGURED: should be specific actions
      resources: ['*'],               // MISCONFIGURED: should be specific bucket ARN
    }));

    appRole.addToPolicy(new iam.PolicyStatement({
      sid: 'OverlyBroadLogsAccess',
      effect: iam.Effect.ALLOW,
      actions: ['logs:*'],            // MISCONFIGURED: wildcard
      resources: ['*'],
    }));

    // IAM user with no MFA enforcement (detection: iam user mfa, iam user access key)
    const serviceUser = new iam.User(this, 'ServiceUser', {
      userName: 'netlumi-e2e-service-user',
      // MISCONFIGURED: no MFA device, no permission boundary
    });

    serviceUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`arn:aws:s3:::${foundationBucketName}/*`],
    }));

    // SQS queue — no encryption, long retention, no DLQ
    const processingQueue = new sqs.Queue(this, 'ProcessingQueue', {
      queueName: 'netlumi-e2e-processing',
      // MISCONFIGURED: no encryption (should use KMS from foundation)
      retentionPeriod: cdk.Duration.days(14),  // MISCONFIGURED: excessive retention
      // MISCONFIGURED: no dead letter queue
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    // Export role ARN to SSM for netlumi-cdk-compute
    new ssm.StringParameter(this, 'AppRoleArnParam', {
      parameterName: '/netlumi/e2e/iam/app-role-arn',
      stringValue: appRole.roleArn,
      description: 'Netlumi E2E app IAM role ARN',
    });

    new ssm.StringParameter(this, 'QueueUrlParam', {
      parameterName: '/netlumi/e2e/iam/queue-url',
      stringValue: processingQueue.queueUrl,
      description: 'Netlumi E2E processing queue URL',
    });

    new cdk.CfnOutput(this, 'AppRoleArn', { value: appRole.roleArn });
    new cdk.CfnOutput(this, 'QueueUrl', { value: processingQueue.queueUrl });
    new cdk.CfnOutput(this, 'FoundationBucketName', { value: foundationBucketName });
  }
}
