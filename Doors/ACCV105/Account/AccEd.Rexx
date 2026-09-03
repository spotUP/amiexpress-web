/* ----------------------------------------------------------------------- */
/*  Account Ed V1.05 written by Delusion Of Virtual In 1993. © DLS/VTL 93  */
/*                                                                         */
/*  Version 1.00 Created 08-28-92  ««---»»  Version 1.05 Created 05-01-93  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node;options results;signal on syntax;signal on error;signal on ioerr

ss=sendmessage; CR='0D 0A'x; CF='0A'x; NUL='0'x; Name=0; Com=0; VER='1.05'; BS='8'x;AVA='[21;1H[0mAvaiting command.                 'CR
address value "AERexxControl"node;GetUser 100; Nam = Result;GetUser 105; Sec = Result; GetUser 12; Syso = Result;Date = Translate(Date(U),'-','/');Dir='DOORS:Arexx/Account/';TTime=SubStr(Time(),1,2)||SubStr(Time(),4,2)

if SEC < 200 then MsgLog(CR'Command requires higher access. Virtual Rulez, Account Ed Installed !'CR||CR,'Security level too low')

HEADER = 'c[0 p[34mVirtual [32mAccount Ed[34m V'VER' For [32m/X 2.35 [34mBy [35mDelusion / VTL. [34mINSANiTY [36m+46(0)589-10780'CR||CR
ss HEADER'The High Security Performance Door.'CR

/* ------------------------- Delusion 'n Virtual ------------------------- */

if Open('Data',Dir'AccEd.Presets','R') = 1 then do
 Parse Value ReadCH('Data',1826) With NrCom'-' 63 PVer'-' 85 (CF) InPut
 Close('Data')
 Do i = 1 to 9
  Parse Value InPut With '|'DesC.i'|'AccL.i'| 'RatT.i' | 'RatI.i' | 'AutR.i' |'DaiB.i'| 'ConA.i' |'TimS.i'|'Com.i'|' (CF) InPut
  DesC.i = Strip(DesC.i); AccL.i = Strip(AccL.i); DaiB.i = Strip(DaiB.i); TimS.i = Strip(TimS.i)
 end
 Parse Value InPut With STime'-' 63 ETime' 'Com.10'|' (CF) '|'Names'|'Com.11'|' (CF) 233 (CF) ' 'InPut
 Parse Value InPut With 20 UserFile'|' 59 Enable'|' 65 Com.12'|' 104 UserKeys'|' 143 ChangeAcc'|' 149 Com.13'|' 188 BBSConf'|' 227 MsgClean'|' 233 Com.14'|' 272 PassWord'|' 311 SeePass'|' 317 Com.15'|' 356 DelPass'|' 395 ShowPass'|' 401 Com.16'|' 480 Printer'|' 486 Com.17'|' 525 Col'|' 564 NewSlot'|' 570 Com.18'|' 609 Log'|' 648 NotAccC'|' 654 Com.19'|'
 BBSConf = Strip(BBSConf); ShowPass = Strip(ShowPass); Col = Strip(Col)
 if PVer ~= VER then MsgLog(CR'[0mInvalid version of your AccEd.Presets file! Consult documentation ..'CR||CR,'Wrong Preset File Version')
 if PassWord ~= '' then if Upper(Change('[35mPlease enter password: [32m',20,'5;1','','*')) ~= Upper(PassWord) then MsgLog(CR'[0mPassword verification failed ..'CR||CR,'Wrong Account ED Password')
 if Index(Names,Nam) = 0 then MsgLog(CR'[35mYou are not allowed to use the account editor. Access denied!'CR||CR,'Tried to use the Account Editor')
 if TTime > STime & TTime < ETime then MsgLog(CR'[35mYou are not allowed to use the account editor between the timezones [36m'STime||CR'[35mand [36m'ETime'[35m. Give it a try later or consult your sysop! Access denied!'CR||CR,'Account Editing not allowed at this time')
 Drop InPut Names PVer STime ETime TTime PassWord
end

Open('UserData',Strip(UserFile),'R')
Open('UserKeys',Strip(UserKeys),'R')

Seek('UserData',-148,'E')
Do Until NrUsers > 0
 NrUsers = C2D(ReadCH('UserData',2))
 Seek('UserData',-234,'C')
end

if Open('Log',Dir'AccEd.Log','A') = 0 then Open('Log',Dir'AccEd.Log','W')

/* ------------------------- Delusion 'n Virtual ------------------------- */

Do While Com ~= ''
 Com = Que(CR'[0 p[35mS[34m)[36mearch by name  [35mN[34m)[36mew accounts  [35mC[34m)[36mhange conf acc  [35mM[34m)[36msgbase cleaner  [35mU[34m)[36mser info'CR'[36mEdit wich account ?[0m[ p ')
 if Com = 'C' then Call Change_ConfAcc
 if Com = 'U' then Call User_Info
 if Com = 'M' then Call Clean_MsgBase
 if Com = 'LOG' then ShowFile (Dir'AccEd.Log')
 if Com = '1' then ss CR'You may NOT look at the Sysops account.'CR
 if Com ~= 'S' & Com ~= 'N' & Com ~= 'C' & Com ~= 'U' & Com ~= 'LOG' & Com ~= '0' & Com ~= '1' & Com > 1 & Com < 10001 then do
  SlotNr = Com
  Call Read_Account
  if Valid = 'Yes' then Call Account_Loop
 end
 if Com = 'S' then do
  SName = NUL||Que(CR'[35mS[34m)[36mearch by name ?[0m ')
  if SName ~= NUL then do
   SlotNr = 1; New = 'N'
   Call Search
   if Valid = 'Yes' then ss CR'No more users found.'CR
  end
 end
 if Com = 'N' then do
  ss CR'[35mN[34m)[36mew account editing![0m 'CR
  New = 'Y'; Call Search
 end
end
PutUstr '	[35mAccount Editing...	Seclevel 'SEC' (AccEd)[0m'CF; PutUser 150
ss CR'						          [34;1m/\/[0;35m Virtual [34;1m/\/[0m 1993'CR||CR
Close('UserData'); Close('UserKeys'); Close('Log'); SHUTDOWN; EXIT

/* ------------------------- Delusion 'n Virtual ------------------------- */

Search:
ss CR'Please wait scanning user data.'CR
if New = 'Y' then do
 SlotNr = NewSlot + 1
 Seek('UserData',(NewSlot * 232) - 1,'B')
 Do SlotNr = SlotNr to NrUsers Until Seek('UserData',231,'C') = 0
  If C2D(ReadCH('UserData',1)) = 1 then do
   NewSlot = SlotNr
   Call Read_Account
   if Valid = 'Yes' then Call Account_Loop
   Return
  end
 end
 ss CR'Sorry no new users found.'CR
end
else do
 Seek('UserKeys',0,'B')
 SlotNr = Trunc(Index(Upper(ReadCH('UserKeys',56*NrUsers)),SName,SlotNr*56) / 56) + 1
 Call Read_Account
 if Valid  = 'Yes' then Call Account_Loop
 if Valid ~= 'Yes' then ss CR'Sorry user not found.'CR
end
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Clean_Msgbase:
if SEC < MsgClean then do; ss CR'Command requires higher access.'CR;return;end
ss Header; Nr = 0
ss '[35mM[34m)[36msgbase Cleaner, Deletes all private recieved mail except EALL messages!'CR||CR
Conf = Que('       [36mPath to conference to process [35m? [32m: [0m')
if Open('MS',CONF'/MsgBase/MailStats','R') = 0 then do
 ss CR"Directory doesn't exist. Aborting!"CR
 return
end
Num = C2D(SubStr(ReadLN('MS'),5,4)) - 1
Close('MS'); Call AddLib('rexxsupport.library',0,-30)
if Open('POS',Conf'/MsgBase/DelLastNr','R') = 0 then Open('POS',Conf'/MsgBase/DelLastNr','W')
Lst = Strip(ReadLN('POS')); if Lst = '' then Lst = 1
ss '          [36mHighest msg in conference is [32m: [0m'Num||CR||CR
SNum = Que('[36mNumber to start deleting from [35m? [34m([36m'Right(Lst,4)'[34m) [32m: [0m')
ENum = Que('[36m   Number to stop deleting at [35m? [34m([36m'Right(Num,4)'[34m) [32m: [0m')
if SNum < 1 | SNum = '' then SNum = Lst
if ENum > Num | ENum = '' then ENum = Num
ss CR'Searching for mail..'CR
Open('HF',CONF'/MsgBase/HeaderFile','R')
 Seek('HF',(SNUM-1)*110,'B')
 Do i = SNum to ENum
  In = ReadCH('HF',110)
  if SubStr(In,1,1) = 'R' & SubStr(In,105,4) ~= NUL||NUL||NUL||NUL then do
   Seek('HF',-110,'C')
   Nr = Nr + 1
   WriteCH('HF','D'Overlay(D2C((252482400 + Time('S') + (86400 * Date('I')))),SubStr(In,2,109),96))
   Parse Var In . (NUL) 6 To (NUL) 36 Name (NUL) .
   Delete(Conf'/MsgBase/'i)
   ss '[35mMessage [34m#[32m'Right(i,4)' [34mdeleted.. Msg written by[35m: [0m'Left(Name,15)'  [34mTo[35m: [0m'Left(To,15)||CR
  end
  if SubStr(In,7,4) = 'EALL' & SubStr(In,1,1) = 'P' then do
   Parse Var In . (NUL) 37 Name (NUL) 67 Subject (NUL) .
   ss CR'[35mMessage [34m#[32m'Right(i,4)' [34mis a EALL Msg written by[35m: [0m'Name||CR
   Ans =  Que('                    [34mMessage subject is[35m: [0m'Subject||CR'[36mDo you wish to make this EALL Msg a ALL Msg or Delete it[34m? [36m([35mY/N/D[34m)[32m: [0m','C','Y','Yes..'CR,'N','No..'CR)
   if Ans = 'Y' then do
    Seek('HF',-110,'C')
    WriteCH('HF',Overlay(Left('ALL',31,NUL),In,7))
   end
   if Ans = 'D' then do
    ss 'Delete..'CR||CR; Seek('HF',-110,'C'); Delete(Conf'/MsgBase/'i)
    WriteCH('HF',Overlay(Left('ALL',31,NUL),In,7))
   end
  end
 end
Close('HF'); RemLib('rexxsupport.library')
ss CR'[36mTotal number of messages deleted[32m: [35m'Nr||CR
Seek('POS',0,'B'); WriteLN('POS',Left(ENum,5)); Close('POS')
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Change_ConfAcc:
if SEC < ChangeAcc then do; ss CR'Command requires higher access.'CR;return;end
Pos = 87; ss HEADER'[35mC[34m)[36mhange ALL users conference access.'CR
Give = Que('Be very careful with this command. Just press return to abort!'CR||CR'[0mGive or Take access ?    [34m([36mG/T[34m)[32m:[0m ','C','G','Give','T','Take')
if Give = 'G' then Type = 'X'; If Give = 'T' then Type = '_'; if Give ~= 'G' & Give ~= 'T' then ss CR
Conf = Que('[0 pConference to process ?  [34m([36m1-9[34m)[32m:[0m[ p ')
if Give = 'G' & Conf > 0 & Conf < 10 | Give = 'T' & Conf > 0 & Conf < 10 then do
 if Que('Ask for access levels ?  [34m([36mY/N[34m)[32m:[0m ','C','Y','Yes..','N','No..') = 'N' then do
  ss CR'[0 p[35mPlease wait updating user data.'CR'[0mProcessing account: 'CR
  Pos = 135 + Conf
  Seek('UserData',Pos,'B')
  Do I = 1 to NrUsers Until Seek('UserData',231,'C') = 0
   ss '[11;21H'I; WriteCH('UserData',Type)
  end
  ss CR'Finished.'CR
 end
 else do
  MinA = Que(CR'Minimum access level ? [34m([36m1-255[34m)[32m:[0m[ p ')
  MaxA = Que('[0 pMaximum access level ? [34m([36m1-255[34m)[32m:[0m[ p ')
  if MinA > 1 & MinA < 256 & MaxA > 1 & MaxA < 256 then do
   ss CR'[0 p[35mPlease wait updating user data.'CR'[0mProcessing account: 'CR
   Seek('UserData',87,'B')
   ConfPos = 47 + Conf
   Do I = 1 to NrUsers Until Seek('UserData',Pos,'B') = 0
    ss '[14;21H'I; AccL = C2D(ReadCH('UserData'));Pos=Pos+232
    If AccL >= MinA & AccL <= MaxA then do
     Seek('UserData',ConfPos,'C')
     WriteCH('UserData',Type)
    end
   end
   ss CR'Finished.'CR
  end
 end
end
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

User_Info:
Pos = 87; ss HEADER'[35mU[34m)[36mser Info. Just press'; Lin = '[1;34m-------------------------------------------------------------------------------[0m'CR
Give = Que(' return to abort!'CR||CR'[0mSecurity or Conf Info ? [34m([36mS/C[34m)[32m:[0m ','C','S','Sec','C','Conf')
if Give = 'S' then do
 MinA = Que('Minimum access level ?[34m([36m1-255[34m)[32m:[0m[ p ')
 if MinA < 1 | MinA > 256 then return
 MaxA = Que('[0 pMaximum access level ?[34m([36m1-255[34m)[32m:[0m[ p ')
 if MaxA < 1 & MaxA > 256 then return
 ss HEADER'[34mTotal Numbers Of Users[32m:[36m '
 ss NrUsers||CR||CR'[34m[[35mNr.[34m] [[36mUser Name                [34m] [[35mUser Group/Location      [34m] [[33mConf Acc.[34m] [[32mSec[34m]'CR
 ss Lin
 Seek('UserData',87,'B')
 Do I = 1 to NrUsers Until Seek('UserData',231,'C') = 0
  AccL = C2D(ReadCH('UserData'))
  if AccL >= MinA & AccL <= MaxA then do
   Seek('UserData',-88,'C');UserDate = ReadCH('UserData',146);Seek('UserData',-58,'C')
   Parse Var UserDate Name (NUL) 40 Loca (NUL)
   ss '[34m[[35m'Right(I,3)'[34m][36m  'Left(Name,26)'[35m  'Left(Loca,26)'[33m  'SubStr(UserDate,137,9)'[32m   'C2D(SubStr(UserDate,88,1))||CR
  end
 end
 ss Lin
end
if Give = 'C' then do
 Conf = Que('Conference to process ? [34m([36m1-9[34m)[32m:[0m ')
 if Conf > 0 & Conf < 10 then do
  ss HEADER'[34mTotal Numbers Of Users[32m:[36m '
  ss NrUsers||CR||CR'[34m[[35mNr.[34m] [[36mUser Name                  [34m] [[35mUser Group/Location         [34m] [[33mRat[34m] [[32mSec[34m]'CR
  ss Lin
  ConfPos = 135 + Conf; BackPos = ConfPos + 1; Pos = -ConfPos -1
  Seek('UserData',ConfPos,'B')
  Do I = 1 to NrUsers Until Seek('UserData',231,'C') = 0
   if ReadCH('UserData') = 'X' then do
    Seek('UserData',Pos,'C');UserDate=ReadCH('UserData',BackPos)
    Parse Var UserDate Name (NUL) 40 Loca (NUL)
    Ratio='1/'C2D(SubStr(UserDate,91,2));if Ratio = '1/0' then Ratio = 'DIS'
    ss '[34m[[35m'Right(I,3)'[34m][36m  'Left(Name,28)'[35m  'Left(Loca,29)'[33m  'Ratio'[32m   'C2D(SubStr(UserDate,88,1))||CR
   end
  end
  ss Lin
 end
end
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Save_Account:
ss '[0mPlease wait saving account.          'CR
If NewUser = 'No ' then NewUser = 0
If NewUser = 'Yes' then NewUser = 1
If Status = 'Inactive' then Status = 0
If Status = 'Active' then Status = SlotNr

UserDate = Overlay(Left(Strip(Name)	,31,NUL),UserDate,  1)
UserDate = Overlay(Left(Strip(Loca)	,30,NUL),UserDate, 41)
UserDate = Overlay(Right(D2C(Status)	, 2,NUL),UserDate, 85)
UserDate = Overlay(D2C(Secs)			,UserDate, 88)
UserDate = Overlay(Right(D2C(RatioType)	, 2,NUL),UserDate, 89)
UserDate = Overlay(Right(D2C(Ratio)	, 2,NUL),UserDate, 91)
UserDate = Overlay(Right(ConfAcc	, 9,NUL),UserDate,137)
UserDate = Overlay(Right(D2C(Auto)	, 2,NUL),UserDate,151)
UserDate = Overlay(Right(D2C(Limi)	, 4,NUL),UserDate,163)
UserDate = Overlay(Right(D2C(ByteLimit)	, 4,NUL),UserDate,179)
UserDate = Overlay(D2C(NewUser)			,UserDate,232)

if Sec > (Enable - 1) then do
 UserDate = Overlay(Left(Strip(Pass)	, 9,NUL),UserDate, 32)
 UserDate = Overlay(Left(Strip(Phon)	,14,NUL),UserDate, 71)
 UserDate = Overlay(Right(D2C(UpLoads)	, 2,NUL),UserDate,147)
 UserDate = Overlay(Right(D2C(DownLoads), 2,NUL),UserDate,149)
 UserDate = Overlay(Right(D2C(TimeUsed)	, 3,NUL),UserDate,159)
 UserDate = Overlay(Right(D2C(DBytes)	, 4,NUL),UserDate,171)
 UserDate = Overlay(Right(D2C(UBytes)	, 4,NUL),UserDate,175)
end

Seek('UserData',(SlotNr - 1) * 232,'B')
WriteCH('UserData',UserDate)

UserKeys = Overlay(Left(Name		,34,NUL),UserKeys, 1)
UserKeys = Overlay(Right(D2C(Status)	, 2,NUL),UserKeys,35)
UserKeys = Overlay(Right(D2C(ULCPS)	, 2,NUL),UserKeys,39)
UserKeys = Overlay(Right(D2C(DLCPS)	, 2,NUL),UserKeys,41)
UserKeys = Overlay(Right(D2C(BaudRate)	, 2,NUL),UserKeys,45)

Seek('UserKeys',(SlotNr - 1) * 56,'B')
WriteCH('UserKeys',UserKeys) 

if Log = 2 | Log = 3 then WriteLN('Log',DATE' Wrote 'Left(NAM,20)' Account #'Left(SlotNr,3)', At ('TIME()')')
ss '[21;1H[0mAccount saved.                    'CR
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Read_Account:
if SlotNr < 2 then SlotNr = NrUsers; if SlotNr > NrUsers then SlotNr = 2
if Seek('UserData',(SlotNr - 1) * 232,'B') = 0 then do
 ss CR'That account does not exist.         'CR
 Valid = 'No'
 return
end
ss CR'Please wait loading account.           'CR
Valid = 'Yes'
UserDate = ReadCH('UserData',232)	/* All data & positions found out */
UserDati = UserDate			/* By Delusion 1992 for AccountED */

Parse Var UserDati Name (NUL) 31 Pass (NUL) 39 Loca (NUL) 68 Phon (NUL)

Status    = C2D(SubStr(UserDate,85,2))		/* Remeber: It's real lame*/
Secs      = C2D(SubStr(UserDate,88,1))		/* to ripp someone elses  */
RatioType = C2D(SubStr(UserDate,89,2))		/* hard work, if you ripp */
Ratio     = C2D(SubStr(UserDate,91,2))		/* my source, It will be  */
ComType   = C2D(SubStr(UserDate,93,2)) + 1	/* Your biggest mistake!  */
MsgPosted = C2D(SubStr(UserDate,95,2))		/* Count on that LAMER!   */
LastOn    = C2D(SubStr(UserDate,97,4))

ConfAcc   =     SubStr(UserDate,137,9)
Uploads   = C2D(SubStr(UserDate,147,2))
DownLoads = C2D(SubStr(UserDate,149,2))
Auto      = C2D(SubStr(UserDate,151,2))
Calls     = C2D(SubStr(UserDate,153,2))
Unknown   = C2D(SubStr(UserDate,154,4))
TimeUsed  = C2D(SubStr(UserDate,159,3))
Limi      = C2D(SubStr(UserDate,163,4))

DBytes    = C2D(SubStr(UserDate,171,4))
UBytes    = C2D(SubStr(UserDate,175,4))
ByteLimit = C2D(SubStr(UserDate,179,4))
NumLines  = C2D(SubStr(UserDate,231,1))
NewUser   = C2D(SubStr(UserDate,232,1))

Seek('UserKeys',(SlotNr - 1) * 56,'B')
UserKeys  = ReadCH('UserKeys',56)
ULCPS     = C2D(SubStr(UserKeys,39,2))
DLCPS     = C2D(SubStr(UserKeys,41,2))
BaudRate  = C2D(SubStr(UserKeys,45,2))

if ULCPS > 3000 then ULCPS = 0
if DLCPS > 3000 then DLCPS = 0
if BaudRate > 16800 then BaudRate = 14400

if Log = 1 | Log = 3 | Log = 4 & Nam ~= Syso then WriteLN('Log',DATE' Read  'Left(NAM,20)' Account #'Left(SlotNr,3)', At ('TIME()')')
Rating = Trunc(((UBytes+(50000*(MsgPosted+Calls))-DBytes)/60000)+(Uploads-Downloads))

TimeOn = (LastOn - 252482400) / 86400	      /* TimeStampCalc © DLS/VTL 93 */
if TimeOn > 0 then do			      /* Am I First With This !? :) */
 TimeHH = Trunc((TimeOn        - Trunc(TimeOn       )) * 24)
 TimeMM = Trunc((TimeOn * 24   - Trunc(TimeOn * 24  )) * 60)
 TimeSS = Trunc((TimeOn * 1440 - Trunc(TimeOn * 1440)) * 60)
 TimeOn = Date('N',Trunc(TimeOn))
 if TimeHH < 10 then TimeHH = '0'TimeHH
 if TimeMM < 10 then TimeMM = '0'TimeMM
 if TimeSS < 10 then TimeSS = '0'TimeSS
 LastOn = SubStr(TimeOn,1,6)' 'SubStr(TimeOn,10,2)' 'TimeHH':'TimeMM':'TimeSS
 Drop TimeOn TimeHH TimeMM TimeSS
end
else LastOn = 'Unknown Date      '

if Upper(ShowPass) = 'ON' then PassH = Pass; if Upper(ShowPass) ~= 'ON' then PassH = 'Not Displayed'
if Status = 0 then Status = 'Inactive'; if Status = SlotNr then Status = 'Active'
if NewUser = 0 then NewUser = 'No '; if NewUser = 1 then NewUser = 'Yes'
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Account_Loop:
Call ShowAccount
Do until Com = 'X'
ss '[0 p[21;1H[30m'; GetChar; Com = Result
if Com = '' then Call UpdateAccount
if Com = '~' | Com = '*' then Call Save_Account
if Com = '09'x then do; Call Search; return; end
if Com = '0' then do;Status = 'Active';ss '[3;19H[36m'SlotNr'[34m][0m Active [35mSpeed [34m[[36m'BaudRate'[34m] [35mUL CPS [34m[[36m'ULCPS'[34m] [35mDL CPS [34m[[36m'DLCPS'[34m]      [21;1H[0mAccount reactivated.                    'CR;end
if Com = '7F'x then do;Status = 'Inactive';ss '[3;19H[36m'SlotNr'[34m][0m Inactive [35mSpeed [34m[[36m'BaudRate'[34m] [35mUL CPS [34m[[36m'ULCPS'[34m] [35mDL CPS [34m[[36m'DLCPS'[34m]      [21;1H[0mAccount deleted.                    'CR;end
if Com = 'X' then ss '[0mExit no save.                     'CR
if Com = '-' then do;SlotNr=SlotNr-1 ;Call UpdateAccount;end
if Com = '+' then do;SlotNr=SlotNr+1 ;Call UpdateAccount;end
if Com = '[' then do;SlotNr=SlotNr-10;Call UpdateAccount;end
if Com = ']' then do;SlotNr=SlotNr+10;Call UpdateAccount;end
if Com = 'a' then Name = Change(Name,31,'5;21',Col)
if Com = 'b' then Loca = Change(Loca,31,'6;21',Col)
if Com = 'n' then Auto = Change(Auto,2,'9;61',Col)
if Com = 'u' then Limi = Change(Limi,8,'17;17',Col)
if Com = '?' then do
 ShowFile (Dir'AccEd.HelpS'); GetChar
 ShowFile (Dir'AccEd.HelpC'); ss AVA
end
if Com = 'D' then do
 ss "[0mDelete users questionary ? (y/N) : "; GetChar
 if Upper(Result) = 'Y' then do
  if Upper(Change('Yes..  Enter password: ',8,'21;36','','*')) = Upper(DelPass) then do
   if Open('Answer',DIR'QuestApp/'SlotNr,'R') = 1 then do
    Parse Value ReadLN('Answer') With OldName' ['.
    Close('Answer')
    Rename(DIR'QuestApp/'SlotNr,DIR'QuestDel/'Space(OldName,1,'-'))
   end
   ss '[0 p[21;1H[0mQuestionary deleted..                                              'CR
  end
  else ss '[0 p[21;1H[0mWrong password.. Access denied!                                    'CR
 end
 else ss AVA
end
if Com = 'W' then do
 ss '[0mWriting *Warning* message to user.  '
 Open('MS',BBSCONF'/MsgBase/MailStats','R')    /* Msg To MsgBase V1.03 Coded  */
  Num = C2D(SubStr(ReadLN('MS'),5,4))          /* By Delusion/VTL. © DLS 1993 */
  Seek('MS',0,'B')
  WriteCH('MS',Right(D2C(1),4,NUL)||Right(D2C(Num+1),4,NUL)||Right(D2C(1),4,NUL)||Left('',6,NUL))
 Close('MS')
 Open('HF',BBSCONF'/MsgBase/HeaderFile','A')
  WriteCH('HF','R'Right(D2C(Num),5,NUL)||Left(Name,31,NUL)||Left(Nam,31,NUL)||Left('«» Last Warning «»',32,NUL)||Left(D2C((252482400 + Time('S') + (86400 * Date('I')))),10,NUL))
 Close('HF')
 Open('NR',BBSCONF'/MsgBase/'NUM,'W')
  WriteCH('NR',"I've recognized that you do not do as well as you could with the Uploads"CF"and Downloads on this board. I wan't some more activity of yours or you"CF"will very soon get Deleted and all your credits will be lost forever!"CF' 'CF"[36mYour Uploads[34m....[35m: [32m"Left(UBytes,10)" [36mFiles[34m..[35m: [32m"Left(Uploads,4)" [36mCalls[34m..[35m: [32m"Calls||CF"[36mYour Downloads[34m..[35m: [32m"Left(DBytes,10)" [36mFiles[34m..[35m: [32m"Left(Downloads,4)"  [36mMsgs[34m..[35m: [32m"MsgPosted||CF" "CF"[0;3mThis is your first and only warning.. Signed: "Nam||CF' 'CF"[0;34mNote! I think it's very sad if I have to delete you for this, but this"CF"      is the only way to get some order on this board and to keep it Elite!"CF' 'CF"[35m** [32mAccount Ed V"Ver" by Delusion / Virtual[0m "CF)
 Close('NR')
 ss AVA
end
if Com = '/' then do
 if Open('Quest',Dir'QuestApp/'SlotNr,'R') = 1 then do
  ss 'c'HEADER'[36m';Out=''
  Row1 = ReadLN('Quest')
  Parse Value ReadLN('Quest') With Type' 'Quest
  if Type = '.' then do
   if Quest = '' then Quest = '1'
   Open('Questions',Dir'QuestQst/Questions.'Quest,'R')
   ss '[32m'Row1||CR||CR; Out = '[32m'Row1||CR||CR
   Do until eof('Questions')
    ReadBuff = ReadCH('Questions')
    ReadType = ReadCH('Questions')
    if ReadBuff  = '~' then Show = '[35m'ReadLN('Questions')'[36m 'ReadLN('Quest')||CR
    if ReadBuff ~= '~' then Show = '[35m'ReadLN('Questions')||CR
    ss Show; Out = Out||Show
   end
   Close('Questions')
  end
  else ShowFile (Dir'QuestApp/'SlotNr)
  Close('Quest')
  if Que("[36mDo you wan't to print questionary [35m?.. [34m([32mY/N[34m)[35m [0m: ","C","Y","Yes..","N","No..") = 'Y' & Upper(Printer) ~= 'OFF' then do
   if Out ~= '' then do
    Open('pf','prt:','W')
     WriteLN('pf',Out)
    Close('pf')
   end
   else Address Command 'Type 'Dir'QuestApp/'SlotNr' >PRT:'
  end
  Call ShowAccount
 end
 else ss "[0mUsers questionary doesn't exist!  "CR
end
if Sec > (Enable - 1) then do
 if Com = 'c' & PassH = Pass then Pass = Change(Pass,9,'7;21',Col)
 if Com = 'C' & Sec > (SeePass-1) then do;if Pass = PassH then PassH = 'Not Displayed'; else PassH = Pass; ss '[7;21H'Col||Left(PassH,13); end
 if Com = 'd' then Phon = Change(Phon,13,'8;21',Col)
 if Com = 'e' then Ratio = Change(Ratio,2,'9;21',Col)
 if Com = 'f' then RatioType = Change(RatioType,2,'10;21',Col)
 if Com = 'g' then Uploads = Change(Uploads,5,'11;21',Col)
 if Com = 'G' then Uploads = Calcer(Uploads,5,'Uploaded Files','11;21')
 if Com = 'h' then DownLoads = Change(DownLoads,5,'12;21',Col)
 if Com = 'H' then DownLoads = Calcer(DownLoads,5,'Downloaded Files','12;21')
 if Com = 'i' then UBytes = Change(UBytes,11,'13;21',Col)
 if Com = 'I' then UBytes = Calcer(UBytes,11,'Uploaded Bytes','13;21')
 if Com = 'j' then DBytes = Change(DBytes,11,'14;21',Col)
 if Com = 'J' then DBytes = Calcer(DBytes,11,'Downloaded Bytes','14;21')
 if Com = 'k' then ByteLimit = Change(ByteLimit,11,'15;21',Col)
 if Com = 'K' then ByteLimit = Calcer(ByteLimit,11,'Byte Limit','15;21')
 if Com = 'l' then do;Data = Change(ConfAcc,10,'7;61',Col);if NotAccC > 0 then do;if SubStr(Data,NotAccC,1) = 'X' & SubStr(ConfAcc,NotAccC,1) ~= 'X' then do;Data = Overlay('_',Data,NotAccC);ss '[0 p[21;1H[0mConference 'Strip(NotAccC)' is protected.        'CR;end;end;ConfAcc=Data;end
 if Com = 'm' then do;Data = Change(Secs,4,'8;61',Col);if Secs < Data then do;Data = Secs;ss '[0 p[8;61H'Secs' ';end;Secs = Data; end
 if Com = 'v' then TimeUsed = Change(TimeUsed,8,'17;48',Col)
 if Com  = '.' & Upper(Printer) ~= 'OFF' then do
  ss '[0mPlease wait printing account.     'CR
  Out = HEADER'[35mUser Slot Number[34m [[36m'SlotNr'[34m][0m 'Status' [35mSpeed [34m[[36m'BaudRate'[34m] [35mUL CPS [34m[[36m'ULCPS'[34m] [35mDL CPS [34m[[36m'DLCPS'[34m]   'CR||CR'[35mA[34m)[36m Name ..........: 'Name||CR'[35mB[34m)[36m Location ......: 'Left(Loca     ,39)'[34m([35m123456789[34m)'CR'[35mC[34m)[36m Pass ..........: 'Left(PassH    ,20)'[35mL[34m)[36m Conf Access ...: 'ConfAcc||CR'[35mD[34m)[36m Phone Number ..: 'Left(Phon     ,20)'[35mM[34m)[36m Sec Level .....: 'Secs||CR'[35mE[34m)[36m Ratio .........: 'Left(Ratio    ,20)'[35mN[34m)[36m AutoReJoin ....: 'Auto||CR'[35mF[34m)[36m Ratio Type ....: 'Left(RatioType,20)'[35m*[34m)[36m Messages Posted: 'MsgPosted||CR'[35mG[34m)[36m Uploads .......: 'Left(Uploads  ,20)'[35m*[34m)[36m Total Calls ...: 'Calls||CR
  Out = Out'[35mH[34m)[36m Downloads .....: 'Left(DownLoads,20)'[35m*[34m)[36m New User ......: 'NewUser||CR'[35mI[34m)[36m Bytes Uled ....: 'Left(UBytes   ,20)'[35m*[34m)[36m Last On .......: 'LastOn||CR'[35mJ[34m)[36m Bytes Dled ....: 'Left(DBytes   ,20)'[35m*[34m)[36m Computer Type .: 'Strip(Left(Strip(Com.ComType),18))||CR'[35mK[34m)[36m Byte Limit ....: 'Left(ByteLimit,20)'[35m*[34m)[36m Num Lines .....: 'NumLines||CR||CR'[35mU[34m)[36m Time_Limit: [34m[[36m'Left(Limi,8)'[34m][36m secs  [35mV[34m)[36m Time_Used: [34m[[36m'Left(TimeUsed,8)'[34m][36m secs  [35m*[34m)[36m Rate: 'Rating||CR||CR'[1mVirtual - Quality Above Your Imagination - We Are The Worlds No.1 Door Makers[0m'CR||CR'Printed: 'DATE()' 'Time()'  By: 'NAM||CR||CR
  Open('pf','prt:','W')
   WriteLN('pf',Out)
  Close('pf')
  ss '[21;1H[0mPuuh! Account 'SlotNr' printed.     'CR
 end
end
if Com > 0 & Com < 10 then do
 if NrCom < Com then ss '[0mPreset 'Com' not configured sorry.   'CR
 else do
  ss '[0mPreset 'Com' ('Strip(Left(DesC.Com,15))') 'Left('loaded. ',23-Length(DesC.Com))||CR||Col'[9;21H'Left(RatI.Com,5,' ')'[10;21H'Left(RatT.Com,5,' ')
  ss '[15;21H'Left(DaiB.Com,10,' ')'[17;17H'Left(TimS.Com,8,' ')'[7;61H'ConA.Com' [8;61H'AccL.Com'  [9;61H'AutR.Com'  '
  if NewUser = 'Yes' then do
   NewUser = 'No '
   ss '[12;61H'NewUser
  end
  Secs      = AccL.Com ; Ratio = RatI.Com ; ConfAcc   = ConA.Com
  RatioType = RatT.Com ; Limi  = TimS.Com ; ByteLimit = DaiB.Com; AutoRejoin = AutR.Com
 end
end
end
Drop SlotNr Name Loca Pass PassH Phon Ratio ConfAcc RatioType Secs Uploads Auto DownLoads MsgPosted ULCPS DLCPS UBytes NewUser Calls DBytes NumLines ByteLimit Limi TimeUsed Com Status UserDate BaudRate
Return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Change: Procedure Expose BS        /* Query Routine: Originally coded for  */
Data = Arg(1)		 	   /* Quest(tm) & Connect(tm) by DLS of VTL*/
Pos  = Length(Data) + 1		   /* Sntx: Change(Var,Lenght,X;Y,Col,Type)*/

sendmessage '[ p'Arg(4)'['Arg(3)'H'Data
if Arg(5) = '*' then do;Pos = 1;Data='';end
Do i = Pos to Arg(2) until Input = 'D'x
 GetChar ; Input = Result
 if Input = BS & I = 1 then i = i - 1
 if Input = BS & I > 1 then do
  i = i - 2; sendmessage BS
  Data = DelStr(Data,(i+1),1)
 end
 if Input ~= BS & Input ~= 'D'x then do
  if Arg(5) ~= '*' then sendmessage Input
  if Arg(5)  = '*' then sendmessage '*'
  Data = Insert(Input,Data,(i-1))
 end
end
if Arg(5) = '*' then sendmessage '0D 0A'x
Data = Strip(SubStr(Data,1,(Arg(2)-1)))
return Data

Calcer: Procedure Expose SS CR AVA Col	/* Calcer(Variabel,Lenght,Text,X;Y) */
Type = Que('[21;1H[0m                                  [21;1H[0m'Arg(3)' = 'Arg(1)' [ p','C')
if Type ~= '-' & Type ~= '*' & Type ~= '/' then Type = '+'; ss Type
Data = Change('',Arg(2),'[21;'Length(Arg(1))+7+Length(Arg(3)),'[0m')
if DataType(Data,'N') = 1 then do
 if Type = '+' then Data = Arg(1) + Data
 if Type = '-' then Data = Arg(1) - Data
 if Type = '*' then Data = Arg(1) * Data
 if Type = '/' then Data = Arg(1) / Data
 if Data > -1 & Data < 9999999999 then do
  Calc = Trunc(Data)
  ss '[0 p'Col'['Arg(4)'H'Left(Calc,10)
 end
end
ss '[0 p'AVA'                            '
return Calc

/* ------------------------- Delusion 'n Virtual ------------------------- */

Que: Procedure
if Arg(2) ~= 'C' then do; Query Arg(1); Buffer = Strip(Upper(Result)); end
if Arg(2)  = 'C' then do
 sendmessage Arg(1); GetChar; Buffer = Upper(Result)
 if Buffer = Arg(3) then transmit Arg(4)
 if Buffer = Arg(5) then transmit Arg(6)
end
return Buffer

MsgLog: Procedure Expose Nam Date Dir
sendmessage Arg(1)
if Open('Log',Dir'AccEd.Log','A') = 0 then Open('Log',Dir'AccEd.Log','W')
 WriteLN('Log',DATE' Error 'Left(NAM,20)' 'Arg(2)' ('TIME()')')
Close('Log')
Shutdown; Exit
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

UpdateAccount:
ss '[20;1H[0m';Call Read_Account
ss '[3;19H[36m'SlotNr'[34m] [0m'Status' [35mSpeed [34m[[36m'BaudRate'[34m] [35mUL CPS [34m[[36m'ULCPS'[34m] [35mDL CPS'
ss ' [34m[[36m'DLCPS'[34m]      'CR||CR||Col'[5;21H'Left(Name,34)'[6;21H'Left(Loca,34)'[7;21H'PassH'      [8;21H'Left(Phon,13)'[9;21H'
ss Ratio' [10;21H'RatioType' [11;21H'Left(Uploads,5)'[12;21H'Left(DownLoads,5)'[13;21H'Left(UBytes,10)'[14;21H'Left(DBytes,10)
ss '[15;21H'Left(ByteLimit,10)'[17;17H'Left(Limi,8)'[17;48H'Left(TimeUsed,8)'[17;73H'Rating'      [7;61H'ConfAcc'[8;61H'Secs'  [9;61H'Auto
ss '[10;61H'MsgPosted'   [11;61H'Calls'   [12;61H'NewUser'[13;61H'LastOn'[14;61H'Left(Strip(Com.ComType),18)'[15;61H'NumLines'  'AVA
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

ShowAccount:
ss HEADER'[35mUser Slot Number[34m [[36m'SlotNr'[34m][0m 'Status
ss ' [35mSpeed [34m[[36m'BaudRate'[34m] [35mUL CPS [34m[[36m'ULCPS'[34m] [35mDL CPS [34m[[36m'DLCPS'[34m]   'CR||CR
ss '[35mA[34m)[36m Name [34m..........[35m: 'Col||Name||CR
ss '[35mB[34m)[36m Location [34m......[35m: 'Col||Left(Loca     ,39)'[34m([35m123456789[34m)'CR
ss '[35mC[34m)[36m Pass [34m..........[35m: 'Col||Left(PassH    ,20)'[35mL[34m)[36m Conf Access [34m...[35m: 'Col||ConfAcc||CR
ss '[35mD[34m)[36m Phone Number [34m..[35m: 'Col||Left(Phon     ,20)'[35mM[34m)[36m Sec Level [34m.....[35m: 'Col||Secs||CR
ss '[35mE[34m)[36m Ratio [34m.........[35m: 'Col||Left(Ratio    ,20)'[35mN[34m)[36m AutoReJoin [34m....[35m: 'Col||Auto||CR
ss '[35mF[34m)[36m Ratio Type [34m....[35m: 'Col||Left(RatioType,20)'[35m*[34m)[36m Messages Posted[35m: 'Col||MsgPosted||CR
ss '[35mG[34m)[36m Uploads [34m.......[35m: 'Col||Left(Uploads  ,20)'[35m*[34m)[36m Total Calls [34m...[35m: 'Col||Calls||CR
ss '[35mH[34m)[36m Downloads [34m.....[35m: 'Col||Left(DownLoads,20)'[35m*[34m)[36m New User [34m......[35m: 'Col||NewUser||CR
ss '[35mI[34m)[36m Bytes Uled [34m....[35m: 'Col||Left(UBytes   ,20)'[35m*[34m)[36m Last On [34m.......[35m: 'Col||LastOn||CR
ss '[35mJ[34m)[36m Bytes Dled [34m....[35m: 'Col||Left(DBytes   ,20)'[35m*[34m)[36m Computer Type [34m.[35m: 'Col||Strip(Left(Strip(Com.ComType),18))||CR
ss '[35mK[34m)[36m Byte Limit [34m....[35m: 'Col||Left(ByteLimit,20)'[35m*[34m)[36m Num Lines [34m.....[35m: 'Col||NumLines||CR||CR
ss '[35mU[34m)[36m Time_Limit[35m: [34m['Col||Left(Limi,8)'[34m][36m secs  [35mV[34m)[36m Time_Used[35m: [34m['Col||Left(TimeUsed,8)'[34m][36m secs  [35m*[34m)[36m Rate[35m: 'Col||Rating||CR
ss CR'[35mX[34m=[36mEXIT-NOSAVE  [35m~[34m=[36mSAVE  [35m1-9[34m=[36mPresets  [35m0[34m=[36mRE-ACTIVATE  [35mDEL[34m=[36mDELETE  [34m([35m+/-[34m)  ([35m?[34m)  ([35m/[34m)[0m'CR||CR
ss AVA
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Error: ; Syntax:
ss CR'[0mAn Error/Syntax Error Has Occured In The Main Program On Line #'sigl'! Exiting...'CR'Please Notify SYSOP. Or Delusion if Possible.'CR||CR
WriteLN('Log',DATE' ('TIME()') 'Left(NAM,20)' Syntax Error Line #'Sigl)
Close('Log'); SHUTDOWN; EXIT

IOerr:
ss CR'[0mA File Error Has Occured. It Caused An Error On Line #'sigl'!'CR'Exiting... Please Notify SYSOP. Or Delusion if Possible'CR||CR
WriteLN('Log',DATE' ('TIME()') 'Left(NAM,20)' File Error Line #'Sigl)
Close('Log'); SHUTDOWN; EXIT

/* Nice source, ehh ? I hope you're impressed anyway! Cu l8er DUDE and do  */
/* Not steal all of my nice & clean code OK ? Signed: Delusion / Virtual   */
