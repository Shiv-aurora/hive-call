#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { HiveStack } from "../lib/hive-stack";

const app = new cdk.App();
new HiveStack(app, "HiveProductionStack", { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-east-1" }, description: "HIVE self-learning contact center on AWS" });
