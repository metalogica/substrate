# Image Generation Brief

## User Story
* As a user, I can prompt the agent to generate an image, and then I should see it in the chat in the same UI as other file attachments with a little donload icon next to the multimedia preview.
* I can also upload a batch of images into the the file upload UI and prompt the agent to run image procesing workflows on those images, and then the batch of images appears in the conversation thread.

## Context
* A user currently can prompt hte agent 'generate an image...' and the zeroclaw agaent runtime will delegate it to a vision write sub agent using a model of choice (e.g. google nano banana). However, we have to run a manual command to download these files.
```bash
kubectl cp -n claw-kd7bnmjnrzfg6h93e2sfh6h0v584w9ke \
  claw-kd7bnmjnrzfg6h93e2sfh6h0v584w9ke-9d9d956d6-pjt7z:/zeroclaw-data/workspace/media/ \
  ./media \
  -c claw
```
* We need a dedicated UI multimedia fram very similar to the current multimedia frames bu optimized specifically for ai generated images. For example, they need a download icon, and it should be exrtensible since use-cases on this surface area are distinct from user uplaoded attachments.

* The Zeroclaw docker image will ship with `/media` as hte default folder in the workspace where all AI gneerated images goes. We want to mount this folder as GCS Fuse so that the user can download it thorugh the current interface we've built with GCS fuse. This will involve an infra change.

* we may nede to pass a system tag `[sessionId:  UUID] <REST OF MESSAGE>` into every ws chat sent to the agent loop; we want the agent in the pod to always know the current session so when it generates an image it is given the command to put it in `/media/{conversationId}/{filename}`. Also, it shouldnt be a UUID by defualt; the agent should think of a meaningful name of hte lobster. for example, if its an iamge of alobster, the iamge should be called `lobster.png` not `ufrbhybv-4fi09fiu-rv-i8.png`

* We may nede to update the agent TOOLS.md and AGENTS.md to handle the batching system. For example, the current agent loop will nee to recgonize a batch requesty from the user and break down the task to search for the /user-fileuploads directory for the images, then delegate theose N images to the visio nread sub agent before sending them off to the visio nwrite agent
