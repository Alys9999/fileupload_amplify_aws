import {DynamoDBClient, PutItemCommand} from  '@aws-sdk/client-dynamodb';

export const handler = async (event: any) => {
  const nanoidModule = await import('nanoid');
  const nanoid = nanoidModule.customAlphabet('1234567890abcdef', 10);

  const client = new DynamoDBClient();
  const { inputText, fileName } = JSON.parse(event.body);
  const id = nanoid();
  const bucketName = process.env.BUCKET_NAME;
  const inputFilePath = `${bucketName}/${fileName}.txt`;

  const params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      id: { S: id },
      input_text: { S: inputText },
      input_file_path: { S: inputFilePath },
    },
  };

  try {
    await client.send(new PutItemCommand(params));
    console.log("write to dynamoDB sucessful");
    console.log("InputText: "+ inputText)
    return { statusCode: 200,  headers: {"Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Origin": "*", 
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",}, body: JSON.stringify({ id }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: "An error occurred" }) };
  }
};
