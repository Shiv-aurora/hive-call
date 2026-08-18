import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class HiveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", { encryption: s3.BucketEncryption.S3_MANAGED, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true, lifecycleRules: [{ expiration: cdk.Duration.days(30), prefix: "polly/" }], removalPolicy: cdk.RemovalPolicy.RETAIN });
    const runtimeSecretArn = String(this.node.tryGetContext("runtimeSecretArn") ?? "");
    const runtimeSecret = runtimeSecretArn
      ? secretsmanager.Secret.fromSecretCompleteArn(this, "RuntimeSecret", runtimeSecretArn)
      : new secretsmanager.Secret(this, "RuntimeSecret", { description: "HIVE CockroachDB and Managed MCP credentials", generateSecretString: { secretStringTemplate: JSON.stringify({ DATABASE_URL: "", COCKROACH_MCP_URL: "", COCKROACH_MCP_CLUSTER_ID: "" }), generateStringKey: "COCKROACH_MCP_TOKEN", passwordLength: 40, excludePunctuation: true } });
    const runtimeAccessSecret = new secretsmanager.Secret(this, "RuntimeAccessSecret", { description: "HIVE runtime-reader API token", generateSecretString: { secretStringTemplate: "{}", generateStringKey: "token", passwordLength: 40, excludePunctuation: true } });
    const reviewerAccessSecret = new secretsmanager.Secret(this, "ReviewerAccessSecret", { description: "HIVE reviewer API token", generateSecretString: { secretStringTemplate: "{}", generateStringKey: "token", passwordLength: 40, excludePunctuation: true } });
    const logGroup = new logs.LogGroup(this, "AppLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.DESTROY });
    const webAdapterLayer = lambda.LayerVersion.fromLayerVersionArn(this, "WebAdapter", `arn:${cdk.Aws.PARTITION}:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerArm64:28`);
    const appFunction = new lambda.Function(this, "AppFunction", {
      code: lambda.Code.fromAsset(path.resolve(__dirname, "../../dist/lambda")), runtime: lambda.Runtime.NODEJS_22_X, handler: "run.sh", layers: [webAdapterLayer], architecture: lambda.Architecture.ARM_64,
      memorySize: 2048, timeout: cdk.Duration.seconds(29), logGroup,
      environment: {
        NODE_ENV: "production", REQUIRE_EXTERNAL_SERVICES: "true", REASONING_PROVIDER: "bedrock", AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap", AWS_LWA_ENABLE_COMPRESSION: "true",
        AWS_LWA_ASYNC_INIT: "true", AWS_LWA_READINESS_CHECK_PATH: "/api/health", AWS_LWA_READINESS_CHECK_HEALTHY_STATUS: "100-399", PORT: "8080", HIVE_S3_BUCKET: artifactBucket.bucketName,
        TIER1_MODEL_ID: String(this.node.tryGetContext("tier1ModelId") ?? "amazon.nova-micro-v1:0"), TIER2_MODEL_ID: String(this.node.tryGetContext("tier2ModelId") ?? this.node.tryGetContext("bedrockModelId") ?? "amazon.nova-pro-v1:0"),
        BEDROCK_MODEL_ID: String(this.node.tryGetContext("tier2ModelId") ?? this.node.tryGetContext("bedrockModelId") ?? "amazon.nova-pro-v1:0"), BEDROCK_EMBEDDING_MODEL_ID: String(this.node.tryGetContext("bedrockEmbeddingModelId") ?? "amazon.titan-embed-text-v2:0"),
        DATABASE_URL: runtimeSecret.secretValueFromJson("DATABASE_URL").toString(), COCKROACH_MCP_URL: runtimeSecret.secretValueFromJson("COCKROACH_MCP_URL").toString(), COCKROACH_MCP_CLUSTER_ID: runtimeSecret.secretValueFromJson("COCKROACH_MCP_CLUSTER_ID").toString(), COCKROACH_MCP_TOKEN: runtimeSecret.secretValueFromJson("COCKROACH_MCP_TOKEN").toString(),
        HIVE_RUNTIME_TOKEN: runtimeAccessSecret.secretValueFromJson("token").toString(), HIVE_REVIEWER_TOKEN: reviewerAccessSecret.secretValueFromJson("token").toString(),
        POLLY_VOICE_ID: "Ruth", POLLY_ENGINE: "generative", HIVE_TENANT_SLUG: "northstar", DEMO_RATE_LIMIT: "12", DEMO_CASE_REPLAY_LIMIT: "3", VOICE_RATE_LIMIT: "12", VOICE_TRANSCRIBE_RATE_LIMIT: "20", TRANSCRIBE_UTTERANCE_MAX_SECONDS: "15", TRANSCRIBE_MONTHLY_SECONDS_LIMIT: "3000", RATE_LIMIT_WINDOW_MS: "600000", BUILD_COMMIT: process.env.BUILD_COMMIT ?? "cdk",
      },
    });
    artifactBucket.grantReadWrite(appFunction);
    appFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: ["*"] }));
    appFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ["polly:SynthesizeSpeech", "polly:DescribeVoices"], resources: ["*"] }));
    appFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ["transcribe:StartStreamTranscription"], resources: ["*"] }));

    const api = new apigwv2.CfnApi(this, "HttpApi", { name: "hive-production", protocolType: "HTTP", corsConfiguration: { allowOrigins: ["*"], allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type", "authorization"], maxAge: 3600 } });
    const integration = new apigwv2.CfnIntegration(this, "LambdaIntegration", { apiId: api.ref, integrationType: "AWS_PROXY", integrationUri: appFunction.functionArn, integrationMethod: "POST", payloadFormatVersion: "2.0", timeoutInMillis: 29_000 });
    new apigwv2.CfnRoute(this, "DefaultRoute", { apiId: api.ref, routeKey: "$default", target: `integrations/${integration.ref}` });
    new apigwv2.CfnStage(this, "ProductionStage", { apiId: api.ref, stageName: "$default", autoDeploy: true, defaultRouteSettings: { throttlingBurstLimit: 50, throttlingRateLimit: 25 } });
    appFunction.addPermission("ApiGatewayInvoke", { principal: new iam.ServicePrincipal("apigateway.amazonaws.com"), sourceArn: `arn:${cdk.Aws.PARTITION}:execute-api:${this.region}:${this.account}:${api.ref}/*` });

    const dashboard = new cloudwatch.Dashboard(this, "Dashboard", { dashboardName: "HIVE-Production" });
    dashboard.addWidgets(new cloudwatch.GraphWidget({ title: "Lambda invocations and errors", left: [appFunction.metricInvocations(), appFunction.metricErrors()], right: [appFunction.metricDuration()] }));
    dashboard.addWidgets(new cloudwatch.GraphWidget({ title: "HIVE model usage", left: [new cloudwatch.Metric({ namespace: "HiveCall", metricName: "ModelCalls", dimensionsMap: { ModelRole: "FastResponse" } }), new cloudwatch.Metric({ namespace: "HiveCall", metricName: "ModelCalls", dimensionsMap: { ModelRole: "Reasoning" } })], right: [new cloudwatch.Metric({ namespace: "HiveCall", metricName: "InputTokens", dimensionsMap: { ModelRole: "Reasoning" } }), new cloudwatch.Metric({ namespace: "HiveCall", metricName: "OutputTokens", dimensionsMap: { ModelRole: "Reasoning" } })] }));
    dashboard.addWidgets(new cloudwatch.GraphWidget({ title: "Cost-safety signals", left: [new cloudwatch.Metric({ namespace: "HiveCall", metricName: "ReasoningEscalationsAvoided", dimensionsMap: { ModelRole: "FastResponse" } }), new cloudwatch.Metric({ namespace: "HiveCall", metricName: "HumanEscalations", dimensionsMap: { ModelRole: "Reasoning" } })], right: [new cloudwatch.Metric({ namespace: "HiveCall", metricName: "RateLimitedRequests", dimensionsMap: { Route: "demo-reason" } }), new cloudwatch.Metric({ namespace: "HiveCall", metricName: "RateLimitedRequests", dimensionsMap: { Route: "voice-synthesize" } })] }));
    dashboard.addWidgets(new cloudwatch.GraphWidget({ title: "Voice usage", left: [new cloudwatch.Metric({ namespace: "HiveCall", metricName: "TranscribeSeconds", dimensionsMap: { Route: "voice-transcribe" } }), new cloudwatch.Metric({ namespace: "HiveCall", metricName: "PollyCharacters", dimensionsMap: { Route: "voice-synthesize" } })], right: [new cloudwatch.Metric({ namespace: "HiveCall", metricName: "RateLimitedRequests", dimensionsMap: { Route: "voice-transcribe" } })] }));
    new cloudwatch.Alarm(this, "ErrorAlarm", { metric: appFunction.metricErrors({ period: cdk.Duration.minutes(5) }), threshold: 2, evaluationPeriods: 1, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING });
    new cdk.CfnOutput(this, "ApplicationUrl", { value: `https://${api.ref}.execute-api.${this.region}.${cdk.Aws.URL_SUFFIX}` });
    new cdk.CfnOutput(this, "ArtifactBucketName", { value: artifactBucket.bucketName });
  }
}
