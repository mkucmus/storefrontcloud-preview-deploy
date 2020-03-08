const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const https = require('https');
const client = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});
const delay = ms => new Promise(r => setTimeout(r, ms));

const upsertDeployComment = async (client, repo, commitHash) => {
  const { data: comments } = await client.repos.listCommentsForCommit({
    ...repo,
    commit_sha: commitHash
  });
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

    const deployUrl = `https://${commitHash}.${namespace}.storefrontcloud.io`
    console.log(`Starting deploying PR #${prNumber} on ${deployUrl}`);
    
    await client.get(deployUrl); // double request - temporary cloud's fix
    await delay(3000) // double request - temporary cloud's fix
    const response = await client.get(deployUrl);
    if (!response.data.includes('<html data-n-head-ssr')) {
      throw "Deploy has failed. Application returns wrong data."
    }    
    
    console.log(`Your application is successfully deployed.`);
    const octokit = new github.GitHub(githubToken);
    // TODO: handle PR comment update.
    await upsertDeployComment(octokit, repo, commitHash);

    core.setOutput('preview_url', deployUrl);
   
  } catch (error) {
    core.setFailed(error.message);
  }
})()
