const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const https = require('https');
// const client = axios.create({
//   httpsAgent: new https.Agent({
//     rejectUnauthorized: false // double request - temporary cloud's fix
//   })
// });
const delay = ms => new Promise(r => setTimeout(r, ms));
const getDeployUrl = (version, namespace) => `https://${version}.${namespace}.preview.storefrontcloud.io`
const isPush = ({eventName, issue: { number }}) => {
  if (number && eventName !== 'push') {
    return false;
  }
  
  return true;
}
const upsertDeployComment = async (client, repo, commitHash, deployUrl, namespace, isPush, issue) => {
  const { data: comments } = await client.repos.listCommentsForCommit({
    ...repo,
    commit_sha: commitHash
  });
  //core.debug(comments);
  const DEPLOY_COMMENT_TEMPLATE = ':blue_heart: shopware-pwa successfully deployed';
  const oldComment = comments.find(({body}) => body.startsWith(DEPLOY_COMMENT_TEMPLATE))
  const newCommentBody = `${DEPLOY_COMMENT_TEMPLATE} at ${deployUrl}`
  if (!oldComment) {
    core.info(`deployment comment does not exist. creating new one.`)
    isPush && await client.repos.createCommitComment({
      ...repo,
      commit_sha: commitHash,
      body: newCommentBody
    }) || await client.issues.createComment({ // or PR
      ...repo,
      issue_number: issue.number,
      body: newCommentBody
    });

  } else { // update existing
    core.info(`deployment comment already exists. updating it with new deploy URL.`)
    isPush && await client.repos.updateCommitComment({
      ...repo,
      comment_id: oldComment.id,
      body: newCommentBody
    }) || await client.issues.updateComment({ // or PR
      ...repo,
      comment_id: oldComment.id,
      body: newCommentBody
    })

  }
}

;(async function() {
  try {
    const githubToken = core.getInput('token');
    const namespace = core.getInput('namespace');
    const { sha: commitHash, repo, payload, issue} = github.context

    const prNumber = payload.pull_request && payload.pull_request.number

    if (!githubToken || !prNumber || !namespace) {
      core.setFailed('Some action arguments are missing. Action has failed.');
      return;
    }

    const deployUrl = getDeployUrl(commitHash, namespace)
    console.log(`Starting deploying PR #${prNumber} on ${deployUrl}`);
    
    await axios.get(deployUrl); // double request - temporary cloud's fix
    await delay(10000) 
    const response = await axios.get(deployUrl); // double request - temporary cloud's fix
    console.warn(response.data);
    if (!response.data.includes('<html data-n-head-ssr')) { // TODO: replace with requesting the healthcheck endpoint
      throw "Deploy has failed. Application returns wrong data."
    }
    
    console.log(`Your application is successfully deployed.`);
    //const octokit = new github.GitHub(githubToken);
    //await upsertDeployComment(octokit, repo, commitHash, deployUrl, namespace, isPush(github.context), issue);
    core.setOutput('preview_url', deployUrl);
  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
})()
