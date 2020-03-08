const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const https = require('https');
const client = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // double request - temporary cloud's fix
  })
});
const DEPLOY_COMMENT_TEMPLATE = ':blue_heart: NAMESPACE successfully deployed';
const delay = ms => new Promise(r => setTimeout(r, ms));
const getDeployUrl = (version, namespace) => `https://${version}.${namespace}.storefrontcloud.io`
const upsertDeployComment = async (client, repo, commitHash, deployUrl, namespace) => {
  const { data: comments } = await client.repos.listCommentsForCommit({
    ...repo,
    commit_sha: commitHash
  });

  const oldComment = comments.find(({body}) => body.startsWith(DEPLOY_COMMENT_TEMPLATE))
  const newCommentBody = `${DEPLOY_COMMENT_TEMPLATE.replace('NAMESPACE', namespace)} at ${deployUrl}`
  if (!oldComment) {
    await client.repos.createCommitComment({
      ...repo,
      commit_sha: commitHash,
      body: newCommentBody
    });
  } else {
    await client.repos.updateCommitComment({
      ...repo,
      comment_id: oldComment.id,
      body: newCommentBody
    });
  }
}

;(async function() {
  try {
    const githubToken = core.getInput('token');
    const namespace = core.getInput('namespace');
    const { sha: commitHash, repo, payload } = github.context

    const prNumber = payload.pull_request && payload.pull_request.number

    if (!githubToken || !prNumber || !namespace) {
      core.setFailed('Some action arguments are missing. Action has failed.');
      return;
    }

    const deployUrl = getDeployUrl(commitHash, namespace)
    console.log(`Starting deploying PR #${prNumber} on ${deployUrl}`);
    
    await client.get(deployUrl); // double request - temporary cloud's fix
    await delay(3000) 
    const response = await client.get(deployUrl); // double request - temporary cloud's fix
    if (!response.data.includes('<html data-n-head-ssr')) { // TODO: replace with requesting the healthcheck endpoint
      throw "Deploy has failed. Application returns wrong data."
    }    
    
    console.log(`Your application is successfully deployed.`);
    const octokit = new github.GitHub(githubToken);
    await upsertDeployComment(octokit, repo, commitHash, deployUrl, namespace);
    core.setOutput('preview_url', deployUrl);
  } catch (error) {
    core.setFailed(error.message);
  }
})()
