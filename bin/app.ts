#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IamAccessStack } from '../lib/iam-access-stack';

const app = new cdk.App();
new IamAccessStack(app, 'NetlumiIamAccessStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Netlumi E2E test: IAM roles + SQS (depends on foundation)',
});
