import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb as dynamodb, aws_s3 as s3, aws_iam as iam, aws_apigateway as apigateway, aws_lambda as lambda, aws_ec2 as ec2 } from 'aws-cdk-lib';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fileBucket = new s3.Bucket(this, 'FileBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,  
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
      cors:[
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        }
      ]
    });


    const fileTable = new dynamodb.Table(this, 'FileTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
    });

    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      resources: [fileBucket.bucketArn, fileTable.tableArn],
      actions: ['s3:*', 'dynamodb:*'],
    }));



    const api = new apigateway.RestApi(this, 'fileApi', {
      restApiName: 'File Processing API',

    });
    
const presignLambda = new lambda.Function(this, 'PresignLambda', {
  runtime: lambda.Runtime.NODEJS_16_X, 
  handler: 'presignHandler.handler', 
  code: lambda.Code.fromAsset('lambda'), 
  environment: {
    BUCKET_NAME: fileBucket.bucketName,
  },
  role: lambdaExecutionRole, 
});

    const presignedUrl = api.root.addResource('get-presigned-url');
    presignedUrl.addCorsPreflight({
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS, 
    });

    presignedUrl.addMethod('POST', new apigateway.LambdaIntegration(presignLambda));

    const files = api.root.addResource('files');


    const vpc = new ec2.Vpc(this, 'VPC'); 

  }
}





