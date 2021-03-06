import sinon from 'sinon'

const users: {[name: string]: GitHubUser} = {
  foo: {login: 'foo'},
  bar: {login: 'bar'},
  baz: {login: 'baz'}
}

const fakePR: PullRequest = {
  url: '',
  html_url: 'github.com/repo/pulls/1234',
  user: users.foo,
  title: 'Fake PR',
  requested_reviewers: [users.bar, users.baz]
}

const sendMessagesFake = sinon.fake.returns(Promise.resolve(null))
jest.mock('../src/slack', () => ({
  __esModule: true,
  default: sendMessagesFake
}))

jest.mock('../src/inputs', () => ({
  __esModule: true,
  default: () =>
    Promise.resolve({
      users: {
        foo: 'foo@email.com',
        bar: 'bar@email.com',
        baz: 'baz@email.com'
      },
      slackToken: 'SLACK_TOKEN'
    })
}))

import {assert} from 'chai'

import {PullRequest, GitHubUser, Message, WebhookContext} from '../src/types'
import handleEvent from '../src/handleEvent'

beforeEach(() => {
  sendMessagesFake.resetHistory()
})

test('sends messages when a review is requested', async () => {
  await handleEvent({
    eventName: 'pull_request',
    payload: {
      action: 'review_requested',
      pull_request: fakePR
    }
  })

  assert.isTrue(sendMessagesFake.calledOnce)

  const messages: Message[] = sendMessagesFake.args[0][0]

  assert.strictEqual(messages[0].githubUsername, 'bar')
  assert.include(messages[0].body, 'foo requested your review')

  assert.strictEqual(messages[1].githubUsername, 'baz')
  assert.include(messages[1].body, 'foo requested your review')
})

test('sends messages when a PR is approved', async () => {
  await handleEvent({
    eventName: 'pull_request_review',
    payload: {
      action: 'submitted',
      pull_request: fakePR,
      review: {
        body: 'Looks good.',
        url: '',
        html_url: 'http://github.com/repo/pulls/1/some-review',
        state: 'APPROVED',
        user: users.bar
      }
    }
  })

  assert.isTrue(sendMessagesFake.calledOnce)

  const messages: Message[] = sendMessagesFake.args[0][0]

  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].githubUsername, 'foo')
  assert.include(messages[0].body, 'bar approved')
})

test('sends messages when changes are requested', async () => {
  await handleEvent({
    eventName: 'pull_request_review',
    payload: {
      action: 'submitted',
      pull_request: fakePR,
      review: {
        body: 'Looks good.',
        url: '',
        html_url: 'http://github.com/repo/pulls/1/some-review',
        state: 'CHANGES_REQUESTED',
        user: users.bar
      }
    }
  })

  assert.isTrue(sendMessagesFake.calledOnce)

  const messages: Message[] = sendMessagesFake.args[0][0]

  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].githubUsername, 'foo')
  assert.include(messages[0].body, 'bar requested changes')
})

test('sends messages when a review with comment is left', async () => {
  await handleEvent({
    eventName: 'pull_request_review',
    payload: {
      action: 'submitted',
      pull_request: fakePR,
      review: {
        body: 'Looks good.',
        url: '',
        html_url: 'http://github.com/repo/pulls/1/some-review',
        state: 'COMMENTED',
        user: users.bar
      }
    }
  })

  assert.isTrue(sendMessagesFake.calledOnce)

  const messages: Message[] = sendMessagesFake.args[0][0]

  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].githubUsername, 'foo')
  assert.include(messages[0].body, 'bar commented on')
})

test('sends messages when a comment is left on a PR', async () => {
  await handleEvent({
    eventName: 'pull_request_review_comment',
    payload: {
      action: 'created',
      pull_request: fakePR,
      comment: {
        url: '',
        html_url: 'http://github.com/repo/pulls/1/comments/1',
        body: 'Hmm.',
        user: users.baz
      }
    }
  })

  assert.isTrue(sendMessagesFake.calledOnce)

  const messages: Message[] = sendMessagesFake.args[0][0]

  assert.strictEqual(messages.length, 2)
  assert.strictEqual(messages[0].githubUsername, 'foo')
  assert.strictEqual(messages[1].githubUsername, 'bar')
  assert.include(messages[0].body, 'baz commented on')
  assert.include(messages[0].body, 'Hmm.')
})

test("ignores events that it's not supposed to handle", async () => {
  await handleEvent({
    eventName: 'pull_request',
    payload: {
      action: 'created',
      pull_request: fakePR
    }
  })
  assert.isTrue(sendMessagesFake.notCalled)

  await handleEvent({
    eventName: 'pull_request_review',
    payload: {
      action: 'edited',
      pull_request: fakePR,
      review: {
        body: 'Looks good.',
        url: '',
        html_url: 'http://github.com/repo/pulls/1/some-review',
        state: 'APPROVED',
        user: users.bar
      }
    }
  })
  assert.isTrue(sendMessagesFake.notCalled)

  await handleEvent({
    eventName: 'pull_request_review_comment',
    payload: {
      action: 'edited',
      pull_request: fakePR,
      comment: {
        url: '',
        html_url: 'http://github.com/repo/pulls/1/comments/1',
        body: 'Hmm.',
        user: users.baz
      }
    }
  })
  assert.isTrue(sendMessagesFake.notCalled)

  await handleEvent({
    eventName: 'other_event',
    payload: {}
  })
  assert.isTrue(sendMessagesFake.notCalled)
})
