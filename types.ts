export enum AppStep {
  Upload = 'upload',
  ChooseAction = 'chooseAction',
  UploadFriend = 'uploadFriend',
  DescribeScene = 'describeScene',
  Generating = 'generating',
  Result = 'result',
  ContestMode = 'contestMode',
  ContestResult = 'contestResult',
}

export type ActionType = 'solo' | 'collab' | 'group' | 'contest';
