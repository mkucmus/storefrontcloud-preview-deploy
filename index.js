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

    let isSuccess = false;
    // try to get the success result for 5 times
    for (i = 0; i < 8; i++) {
      const response = await axios.get(deployUrl);
      console.log(`.`);
      if (response.data.includes('<html data-n-head-ssr')) {
        console.log(`Your application is successfully deployed.`);
        core.setOutput('preview_url', deployUrl);
        isSuccess = true
        break;
      } else {
        console.log(`Response from Storefrontcloud.io does not contain deployed data.`);
      }
      
      await delay(5000);
    }

    isSuccess || core.setFailed(`Your application wasn't deployed or got stuck. Retries limit of 7 (40s) is reached.`);
})()
