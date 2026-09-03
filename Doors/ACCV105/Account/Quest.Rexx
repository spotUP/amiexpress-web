/* ----------------------------------------------------------------------- */
/*    Quest V1.10 written by Delusion Of Virtual In 1993. © DLS/VTL 93.    */
/*                                                                         */
/*  Version 1.00 Created 06-07-92  ««---»»  Version 1.10 Created 05-01-93  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node;options results;signal on syntax;signal on error;signal on ioerr;address value "AERexxControl"node
tr=transmit;ss=sendmessage;CR='0D 0A'x;addlib('rexxsupport.library',0,-30);NUL='0'x;DIR='DOORS:Arexx/Account/';VER='1.10';DATE=Translate(Date(U),'-','/')

GetUser  12 ; SYSO=Result; GetUser 100 ; NAME=Result
GetUser 104 ; SLOT=Result; GetUser 105 ; SECS=Result

tr CR'cWelcome to [32mQuest [34m([35mAccount ED[34m)[0m V'VER' by [35mDelusion[0m of [36mVirtual[0m 1993. [35m+46(0)589-10780[0m'CR

Open('Data',Dir'AccEd.Presets','R')
 Parse Value ReadCH('Data',2175) With 89 DesC'|' 104 AccL'|' 109 RatT'|' 112 RatI'|' 115 AutR'|' 118 DaiB'|' 128 ConA'|' 139 TimS'|' 1579 ToName'|' 1879 KickOut'|' 1965 Questionary'|' 2011 AutoAccess'|' 2050 MustEnter'|'
 MustEnter = Strip(Upper(MustEnter)); Questionary = Strip(Questionary); ToName = Strip(ToName); KickOut = Strip(KickOut)
Close('Data')

if Open('Questions',DIR'QuestQst/Questions.'Questionary,'R') = 0 then do
 tr 'No Questions Available, Error Can Not Question You!'
 Call ExitPRG
end

if Exists(DIR'QuestApp/'SLOT) then do
 Open('Answer',DIR'QuestApp/'SLOT,'R')
  Parse Value ReadLN('Answer') With OldName' ['.
 Close('Answer')
 Rename(DIR'QuestApp/'SLOT,DIR'QuestDel/'Space(OldName,1,'-'))
end

Do until Sure ~= 'N'
 tr 'Please Answer The Folowing Questions 100% Correctly!'CR
 Do i = 1 to 1000 until eof('Questions')
  ReadBuff = ReadCH('Questions',2)
  if SubStr(ReadBuff,1,1) = '~' then do
   QueryBuff = ReadLN('Questions')
   Do until InBuff ~= ''
    Query QueryBuff' '
    InBuff = Result
    if InBuff = '' then do
     if MustEnter = 'NO' then do
      KickOut = KickOut - 1
      if KickOut < 1 then do
       tr CR'[35mYou did not answer as many questions as required, therefor you are KICKED OUT'
       tr 'from this board. Never call this board again [33mLAMER![0m'CR
       PutUser 511
      end
     end
     else tr CR'You [35mMUST[0m enter complete answers on [36mEVERY[0m question in this questionary. Reenter.'CR
    end
   end
   In.i = InBuff
  end
  else do
   ReadBuff = ReadLN('Questions')
   tr ReadBuff; i = i - 1
  end
 end
 ss CR'Is the above Correct? ' 
 Do until Sure ~= ''
  GetChar; Sure = Upper(Result)
  if Upper(Result) = 'N' then do
   tr 'No..'
   Seek('Questions',0,'B')
   tr CR'cWelcome to [32mQuest [34m([35mAccount ED[34m)[0m V'VER' by [35mDelusion[0m of [36mVirtual[0m 1993. [35m+46(0)589-10780[0m'CR
  end
 end
end
tr 'Yes..'
Close('Questions')
Open('Answer',DIR'QuestApp/'SLOT,'W')
 WriteLN('Answer',NAME' ['SLOT'] Answered These Questions 'DATE' ('TIME()') ! ')
 WriteLN('Answer','. 'Questionary)
 Do k = 1 to (i-1)
  WriteLN('Answer',In.k)
 end
Close('Answer')
if Open('AnsLog',DIR'Quest.Log','A') = 0 then Open('AnsLog',DIR'Quest.Log','W')
 WriteLN('AnsLog',' 'DATE' ('TIME()')  ['SLOT']	'NAME)
 WriteLN('AnsLog',' ---------------------------------------------------------------------------')
Close('AnsLog')
ADDRESS COMMAND 'FileNote 'DIR'QuestApp/'SLOT' 'Space(Name,1,'-')
if SECS > 10 then do
 tr CR||SYSO' is grateful that you filled out the Questionary afterwards!'
 tr 'Sysop will review your application and look at your status.'
 ADDRESS COMMAND 'FileNote 'DIR'QuestApp/'SLOT' 'Space(Name,1,'-')
 Call ExitPRG
end
else do
 tr CR'[36mYou now have to write a letter to sysop with a short presentation'
 tr 'and the reason why you called this board..'CR
 tr '                       [32m([33m------------------------------[32m)'
 tr '     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m*[33mALL[32m*? [0m'ToName
 tr "[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m? [0mI'm a new user!"
 GetUser 127; BBSConf = Result
 Open('MS',BBSCONF'MsgBase/MailStats','R')   /* Msg To MsgBase V1.03 Coded  */
  Num = C2D(SubStr(ReadLN('MS'),5,4))        /* By Delusion/VTL. © DLS 1993 */
  Do until Exists(BBSCONF'MsgBase/'NUM)
   PutUstr BBSCONF'MsgBase/'NUM
   PutUser 9
  end
  Seek('MS',0,'B')
  WriteCH('MS',Right(D2C(1),4,NUL)||Right(D2C(Num+1),4,NUL)||Right(D2C(1),4,NUL)||Left('',6,NUL))
 Close('MS')
 Open('HF',BBSCONF'MsgBase/HeaderFile','A')
  WriteCH('HF','R'Right(D2C(Num),5,NUL)||Left(ToName,31,NUL)||Left(Name,31,NUL)||Left("I'm a new user!",32,NUL)||Left(D2C((252482400 + Time('S') + (86400 * Date('I')))),10,NUL))
 Close('HF')
 GetUser 142; Toggle = Result
 ss CR||CR"[35mDo you wan't to try to operate "SYSO" ? [0m"; GetChar; Ans = Upper(Result)
 if Toggle = 'ON' & Ans = 'Y' then do
  ss 'Yes..'CR||CR'[32mOperating [35m'SYSO'[36m! [0m[0 p'
  Do i = 1 to 17
   ss '07'x||'«» '
   Do h = 1 to 50; end
  end
  tr CR'[ pOperator Paged.'
 end
 else do
  if Ans  = 'Y' then tr 'Yes'CR||CR'Sorry sysop is not available right now!'
  if Ans ~= 'Y' then tr 'No..'
 end
 tr CR||ToName' will review your application and you will normaly have'
 tr 'your full access within 24 Hours!'CR
 if Strip(Upper(AutoAccess)) = 'YES' then do
  tr '[32mGiving you temporary access so you can upload the 2 Mb limit! :)'
  tr 'This fast access is only given becouse you filled out the questionary!'CR
  tr '[33mSysop regards the given status as: [35m'Strip(DesC)
  PutUstr Strip(AccL); PutUser 105; PutUstr Strip(RatT); PutUser 106
  PutUstr Strip(RatI); PutUser 107; PutUstr Strip(DaiB); PutUser 119
  PutUstr Strip(ConA); PutUser 146; PutUstr Strip(TimS); PutUser 115
 end
 else do
  tr 'Dropping carrier call back after 24 Hrs..'
  tr CR'						            [34;1m/\/[0;35m Virtual [34;1m/\/[0m 1993[ p'CR
  PutUser 511
 end
end
Call ExitPRG

/* ---------------------------- Virtual ------------------------------- */

Error: ; Syntax: ; IOerr:
tr CR'[0mAn Error Has Occured In The Main Program On Line #'sigl'! Exiting...'
tr 'Please Notify 'SYSO'. Or Delusion If It Is Possible.'CR
ExitPRG:
tr CR'						            [34;1m/\/[0;35m Virtual [34;1m/\/[0m 1993[ p'CR
SHUTDOWN;EXIT
