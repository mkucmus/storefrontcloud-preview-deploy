const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

const delay = ms => new Promise(r => setTimeout(r, ms));
const getDeployUrl = (version, namespace) => `https://${version}.${namespace}.preview.storefrontcloud.io`


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
    for (i = 0; i < 7; i++) {
      const response = await axios.get(deployUrl);
      console.log(`${i+1}. try to get the application deployed.`);
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

    isSuccess || core.setFailed(`Your application wasn't deployed or got stuck. Retries limit of 5 (35s) is reached.`);
})()
