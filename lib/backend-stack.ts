import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb as dynamodb, aws_s3 as s3, aws_iam as iam, aws_apigateway as apigateway, aws_lambda as lambda, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';


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
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
    });

    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'DynamoDBAccess', 'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'S3Access', 'arn:aws:iam::aws:policy/AmazonS3FullAccess'),
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
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS, 
    });

    presignedUrl.addMethod('POST', new apigateway.LambdaIntegration(presignLambda));





    const saveToDynamoLambda = new lambda.Function(this, 'SaveToDynamoLambda', {
      runtime: lambda.Runtime.NODEJS_16_X, 
      handler: 'DynamoHandler.handler', 
      code: lambda.Code.fromAsset('lambda'), 
      environment: {
        TABLE_NAME: fileTable.tableName,
        BUCKET_NAME: fileBucket.bucketName,
      },
      role: lambdaExecutionRole,
    });
    fileTable.grantWriteData(saveToDynamoLambda);
    const dataResource = api.root.addResource('data');
    dataResource.addCorsPreflight({
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS, 
    });
    dataResource.addMethod('POST', new apigateway.LambdaIntegration(saveToDynamoLambda));




    const vpc = ec2.Vpc.fromLookup(this, 'TheVPC', {
      vpcId: "vpc-01607842478ff41f6",
    });

    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'SG', 'sg-07aaaf4358bbb5126');


    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access');

    const ec2Role = new iam.Role(this, 'EC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    
    const ec2Lambda = new lambda.Function(this, 'EC2Launcher', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'ec2LauncherHandler.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        TABLE_NAME: fileTable.tableName,
        S3_BUCKET: fileBucket.bucketName,
        EC2_ROLE_ARN: ec2Role.roleArn,
        SECURITY_GROUP_ID: securityGroup.securityGroupId, 
        KEY_PAIR_NAME: 'my-key-pair', 
      },
    });
    const dynamoDbStreamEventSource = new DynamoEventSource(fileTable, {
      startingPosition: StartingPosition.TRIM_HORIZON,
      batchSize: 5, 
      retryAttempts: 2, 
    });
    
    ec2Lambda.addEventSource(dynamoDbStreamEventSource);
    
  }
}





