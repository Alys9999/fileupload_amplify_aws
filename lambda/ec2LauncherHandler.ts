import { EC2Client, RunInstancesCommand, RunInstancesCommandInput } from "@aws-sdk/client-ec2";


const ec2Client = new EC2Client({ region: "us-east-1" }); 

export const handler = async (event: any) => {
    console.log("Event: ", JSON.stringify(event, null, 2));
    
    const dynamoRecord = event.Records[0].dynamodb.NewImage;
    const fileName = dynamoRecord.fileName.S;
    const inputText = dynamoRecord.inputText.S;
    const bucketName = process.env.S3_BUCKET;
    const tableName = process.env.TABLE_NAME;
    const ec2RoleArn = process.env.EC2_ROLE_ARN;
    const securityGroupIds = process.env.SECURITY_GROUP_ID!;
    
    const userDataScript = `#!/bin/bash
    yum update -y
    yum install -y aws-cli
    aws s3 cp s3://${bucketName}/${fileName} /tmp/${fileName}
    echo "${inputText}" >> /tmp/${fileName}
    aws s3 cp /tmp/${fileName} s3://${bucketName}/processed-${fileName}
    aws dynamodb put-item --table-name ${tableName} --item '{"id": {"S": "someId"}, "output_file_path": {"S": "s3://${bucketName}/processed-${fileName}"}}' --region ${process.env.AWS_REGION}
    shutdown -h now
    `;

    const userDataEncoded = Buffer.from(userDataScript).toString('base64');




    const instanceParams: RunInstancesCommandInput = {
        ImageId: 'ami-051f8a213df8bc089', 
        InstanceType: 't2.micro',
        KeyName: 'my-key-pair', 
        SecurityGroupIds: [securityGroupIds], 
        IamInstanceProfile: {
            Arn: ec2RoleArn
        },
        UserData: userDataEncoded,
        MinCount: 1,
        MaxCount: 1
    };

    try {
        const command = new RunInstancesCommand(instanceParams);
        const data = await ec2Client.send(command);
        console.log("Success", data);
        return { status: 'EC2 instance launched', instanceId: data.Instances![0].InstanceId };
    } catch (err) {
        console.error("Failed to launch EC2 instance", err);
        throw new Error('EC2 launch failed');
    }
};
