// Return infos of all the completed Match Report
function getMatchReportInfos(url) {
  // Get the HTML code from the URL
  var html = UrlFetchApp.fetch(url).getContentText("ISO-8859-1");
  
  // Find the schedule
  var schedule = html.substring(html.indexOf('table class="schedule"'),
                                html.indexOf('</table>', html.lastIndexOf('table class="schedule"')));

  // Search for Match Report URLs
  var matchReportInfos = [];
  var index = 0;
  var awayTeam, homeTeam, score, url; // Match Report infos
  
  for(var i = 0;; ++i) {
    // Find Away and Home teams
    index = schedule.indexOf('http://www.sphaxball.com/teams', index);
    awayTeam = schedule.substring(schedule.indexOf('>', index) + 1, schedule.indexOf('<', index));
    index = schedule.indexOf('http://www.sphaxball.com/teams', ++index);
    homeTeam = schedule.substring(schedule.indexOf('>', index) + 1, schedule.indexOf('<', index));
    
    index = schedule.indexOf('http://www.sphaxball.com/division', index);
    
    /***/
    if (index == -1 || awayTeam == "")
      break;
    /***/
    
    url = schedule.substring(index, schedule.indexOf('"', index));
    score = schedule.substring(schedule.indexOf('>', index) + 1, schedule.indexOf('<', index));

    // Fill the match report infos
    matchReportInfos[i] = [];
    matchReportInfos[i]['AwayTeam'] = awayTeam;
    matchReportInfos[i]['HomeTeam'] = homeTeam;
    matchReportInfos[i]['URL'] = url;
    matchReportInfos[i]['Score'] = score;
    
    index = schedule.indexOf('"', index);
  }
  
  return matchReportInfos;
}

// Global variable
var cookies;

// Authentication on SPHB forum to get access to Member pages
function authenticate() {
  var url = "http://www.sphaxball.com/login2/";
  var options = {
    "method" : "post",
    "payload" : {
      "user" : "SphbStatsCenter",
      "passwrd" : "b4N4n4@3Xt45Y"
    },
    "followRedirects" : false
  }
  
  var response = UrlFetchApp.fetch(url, options);
  var headers = response.getAllHeaders();
  if ( typeof headers['Set-Cookie'] !== 'undefined' ) {
    // Make sure that we are working with an array of cookies
    cookies = typeof headers['Set-Cookie'] == 'string' ? [ headers['Set-Cookie'] ] : headers['Set-Cookie'];
    for (var i = 0; i < cookies.length; i++) {
      // We only need the cookie's value - it might have path, expiry time, etc here
      cookies[i] = cookies[i].split( ';' )[0];
    }
  }
}

// Create time intervals with the times and substitutions
function getTimes(times, subs) {
  var newTimes = [];
  
  // Halves played
  for (var i = 0; i != times.length; ++i) {
    if (times[i] == "1")
      newTimes.push("0:00-");
    else if (times[i] == "2")
      newTimes.push("5:00-");
    else if (times[i] == "3")
      newTimes.push("10:00-");
  }
  
  // Substitutions
  var subTime, minute, half;
  
  for (var j = 0; j != subs.length; ++j) {
    subTime = subs[j].split(" ")[1];
    minute = parseInt(subTime.split(":")[0], 10); // Minute
    half = parseInt(subs[j].split(" ")[2], 10); // Half
    minute = minute + (half * 5) - 5;
    subTime = minute.toString() + ":" + subTime.split(":")[1];
    
    if (subs[j].indexOf("in") != -1)
      newTimes.push(subTime + "-");
    else if (subs[j].indexOf("out") != -1)
      newTimes.push("-" + subTime);
  }
  
  // Sort times in chronogical order
  newTimes.sort(function(a, b) {
    var newA = a.replace("-", "").split(":");
    var newB = b.replace("-", "").split(":");
    
    a = parseInt(newA[0], 10) * 60 + parseInt(newA[1], 10);
    b = parseInt(newB[0], 10) * 60 + parseInt(newB[1], 10);
    
    return (a > b) ? 1 : -1;
  });
  
  return newTimes;
}

// Checks if a time is within given intervals
function checkTimeIntervals(time, intervals) {
  var timeInInterval = false; // Is the time within an interval
  var halfMin; // Used to validate if the time was in the same half
  
  var splitTime = time.split(":");
  var timeInSeconds = parseInt(splitTime[0], 10) * 60 + parseInt(splitTime[1], 10);
  
  var splitInterval, intervalInSeconds;
  for (var i = 0; i != intervals.length; ++i) {
    splitInterval = intervals[i].replace("-", "").split(":");
    intervalInSeconds = parseInt(splitInterval[0], 10) * 60 + parseInt(splitInterval[1], 10);
    
    halfMin = Math.floor(parseInt(splitTime[0], 10) / 5) * 5;
    if (halfMin > 10)
      halfMin = 10; // For overtimes
    
    if (intervals[i].substring(0, 1) != "-") { // Check if it's an opening
      if (!timeInInterval && intervalInSeconds < timeInSeconds && splitInterval[0] >= halfMin)
        timeInInterval = true;
    }
    
    if (timeInInterval && intervalInSeconds >= timeInSeconds)
      break; // Time was within that interval
    else {
      if (intervals[i].substring(0, 1) == "-")
        timeInInterval = false; // Time was not within that interval
    }
  }
  
  return timeInInterval;
}

// Count playing time for a player at a position
function countPlayingTime(intervals, overtimeEnd) {
  var playingTime = 0; // Playing time
  var startTime, endTime;
  var halfMin;
  var openingInterval = false;
  
  var splitInterval, intervalInSeconds;
  for (var i = 0; i != intervals.length; ++i) {
    splitInterval = intervals[i].replace("-", "").split(":");
    intervalInSeconds = parseInt(splitInterval[0], 10) * 60 + parseInt(splitInterval[1], 10);
    
    if (intervals[i].substring(0, 1) != "-") { // Check if it's an opening
      if ( ! openingInterval) {
        startTime = intervalInSeconds;
        openingInterval = true;
      }
      else {
        halfMin = Math.floor(parseInt(splitInterval[0], 10) / 5) * 5;
        endTime = halfMin * 60;
        playingTime += endTime - startTime;
        
        startTime = endTime;
        //Logger.log(endTime + " " + startTime);
      }

      if (i == intervals.length-1) {
        halfMin = Math.floor((parseInt(splitInterval[0], 10) + 5) / 5) * 5;
        
        if (halfMin > 10) {
          splitInterval = overtimeEnd.split(":");
          halfMin = 10 + parseInt(splitInterval[0], 10) + (parseInt(splitInterval[1], 10) / 60); // For overtime
        }
        
        startTime = intervalInSeconds;
        endTime = halfMin * 60;
        playingTime += endTime - startTime; // Add the interval to the playing time
      }
      /*else if (openingInterval) {
      endTime = intervalInSeconds;
      playingTime += endTime - startTime; // Add the interval to the playing time
      startTime = intervalInSeconds; // New starting time for the next interval
      }*/
      //}
    }
    else {
      //Logger.log(intervalInSeconds + " " + startTime);
      
      endTime = intervalInSeconds;
      playingTime += endTime - startTime;
      openingInterval = false;
    }
  }
  
  return playingTime;
}

// Return the Scoring Summary of a Match Report
function getScoringSummary(newOnly) {
  Logger.log("getScoringSummary begin");
  
  var matchReportLogSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("match_report_log");
  var gameLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("game_log");
  var playerLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("player_log");
  
  var matchReportArray = [], gameLogArray = [], playerLogArray = []; // Optimize writing speed
  
  // Clear the logs to start from scratch
  if ( ! newOnly) {
    matchReportLogSheet.clear();
    gameLog.clear();
    playerLog.clear();
  }
  
  // Get the completed Match Report infos
  var matchReportInfos = getMatchReportInfos("http://www.sphaxball.com/schedule");
  var matchReportLog = matchReportLogSheet.getDataRange().getValues();
  
  var matchReports = [], matchReportUrl; // Match reports to analyze
  
  for (var i = 0; i != matchReportInfos.length; ++i) {
    matchReportUrl = matchReportInfos[i]['URL'];
    
    if ( ! find(matchReportLog, matchReportUrl))
      matchReports.push(matchReportInfos[i]);
  }
  
  // Log in first to get access to member pages
  authenticate();

  var options = {
    "method": "get",
    // Set the cookies so that we appear logged-in
    "headers": {
      "Cookie": cookies.join(';')
    }
  }
  
  var response;
  var posMrBody, mrBody, rosters, roster, players;
  var posTableGoals, gameGoals, goals;
  var posSubs, mrSubs, subs, sub;
  var posReportId, reportId;
  var index, row;
  var score, overtime, overtimeEnd = "", gameLength;
  
  var startTime = Date.now(); // Start time
  
  // Pengs vs tsunamis : 29 - 30
  // Pengs vs Pixies (10-2 result) : 94-95 the goalkeepers don't have their win/loss
  for (var i = 0; i != matchReports.length; ++i) {
    response = UrlFetchApp.fetch(matchReports[i]['URL'], options).getContentText("ISO-8859-1");
    subs = []; // Substitutions
    
    // Find the rosters
    posMrBody = response.indexOf('<table class="mr-body" id="mr-body">');
    mrBody = response.substring(posMrBody, response.indexOf('</table>', posMrBody));
    
    // Find the substitutions and create an Array
    posSubs = response.indexOf('<td colspan="2">', posMrBody);
    mrSubs = response.substring(posSubs, response.indexOf('</td>', posSubs));
    mrSubs = mrSubs.replace('<td colspan="2">', "").replace(/ replaced /g, "@")
    mrSubs = mrSubs.replace(/ at /g, "@").replace(/ in the /g, "@").replace(/ in /g, "@");
    mrSubs = mrSubs.substring(0, mrSubs.lastIndexOf('<br />'));
    
    if (mrSubs != "")
      subs = mrSubs.split('<br />');
    
    // Search for rosters
    rosters = [], roster = [], players = [], index = 0;
    
    for(var half = 1;; ++half) {
     index = mrBody.indexOf('<td>', index);
      
      /***/
      if (index == -1)
        break;
      /***/
      
      // Remove HTML tags
      row = mrBody.substring(index, mrBody.indexOf('</td>', index));
      row = row.replace(/<td>/g, "").replace(/<\/td>/g, "").replace(/<br \/>/g, "@")
      row = row.replace('<td colspan="2">', "");
      
      roster = row.split("@");
      
      // Add the players and note in which halves they have played
      for (var j = 0; j != roster.length; ++j) {
        if (roster[j] != "") {
          if (players[roster[j]] == null) {
            players[roster[j]] = [];
            players[roster[j]]['Name'] = roster[j].split(" - ")[0]; // Player name
            players[roster[j]]['Position'] = roster[j].split(" - ")[1]; // Position
            players[roster[j]]['Team'] = (half % 2 == 1) ? matchReports[i]['AwayTeam']
                                                         : matchReports[i]['HomeTeam']; // Team
            players[roster[j]]['Started'] = Math.ceil(half / 2) == 1; // Game Started
            players[roster[j]]['Goals'] = 0; // Goals
            players[roster[j]]['Assists'] = 0; // Assists
            players[roster[j]]['Halves'] = []; // Halves played
            players[roster[j]]['Subs'] = []; // Substitutions
            players[roster[j]]['Differential'] = 0; // Goal differential
            players[roster[j]]['GoalsFor'] = 0; // Goals for
            players[roster[j]]['GoalsAgainst'] = 0; // Goals against
            players[roster[j]]['OtGoal'] = false; // Overtime goal
            players[roster[j]]['WinningGoal'] = false; // Game winning goal
            players[roster[j]]['Result'] = ""; // Result for goalkeepers
            players[roster[j]]['Shutout'] = false; // Shutout for goalkeepers
          }
        
          players[roster[j]]['Halves'].push(Math.ceil(half / 2).toString()); // Add half
        }
      }
      
      // Convert time and half of the sub
      var minSub, halfSub, subTime;
      
      // Manage substitutions
      for (var s = 0; s != subs.length; ++s) {
        if (subs[s] != "") {
          sub = subs[s].split("@");
          sub[3] = sub[3].replace("first half", 1).replace("second half", 2).replace("overtime", 3);
          
          // Convert time and half of the goal
          minSub = parseInt(sub[2].split(":")[0], 10); // Minute
          halfSub = parseInt(sub[3], 10); // Half
          minSub = minSub + (halfSub * 5) - 5;
          subTime = minSub.toString() + ":" + sub[2].split(":")[1];
          
          // Sub is in the current half
          if (Math.ceil(half / 2) == sub[3]) {
            // Find the player being replaced with its position
            for(var key in players) {
              if (key.indexOf(sub[1]) != -1
                  && checkTimeIntervals(subTime, getTimes(players[key]['Halves'], players[key]['Subs']))
                  && players[key]['Position'] != null) {
                var newKey = sub[0] + " - " + players[key]['Position']; // New combo name/position
                
                //Logger.log(newKey + " " + sub + " " + subTime);
                //Logger.log(key.indexOf(sub[1]));
                //Logger.log("sub process :" + key + " " + sub[0]);
                
                if (players[newKey] == null) {
                  players[newKey] = [];
                  players[newKey]['Name'] = sub[0]; // Player Name
                  players[newKey]['Position'] = players[key]['Position']; // Position
                  players[newKey]['Team'] = players[key]['Team']; // Team
                  players[newKey]['Started'] = false; // Game Started
                  players[newKey]['Goals'] = 0; // Goals
                  players[newKey]['Assists'] = 0; // Assists
                  players[newKey]['Halves'] = []; // Halves played
                  players[newKey]['Subs'] = []; // Substitutions
                  players[newKey]['Differential'] = 0; // Goal differential
                  players[newKey]['GoalsFor'] = 0; // Goals for
                  players[newKey]['GoalsAgainst'] = 0; // Goals against
                  players[newKey]['OtGoal'] = false; // Overtime goal
                  players[newKey]['WinningGoal'] = false; // Game winning goal
                  players[newKey]['Result'] = ""; // Result for goalkeepers
                  players[newKey]['Shutout'] = false; // Shutout for goalkeepers
                }
                
                players[newKey]['Subs'].push("in " + sub[2] + " " + sub[3]); // Sub in player  
                if (sub[1] != "")
                  players[key]['Subs'].push("out " + sub[2] + " " + sub[3]);   // Sub out player
                subs[s] = "";
                
                break;
              }
            }
          }
        }
      }
      /* Notes about the substitutions 
      The multi substitutions isn't managed, to fix this, we will have to check the time (inclusively) where the player was playing its latest position USE NEW FUNCTION
      The substitution with no player isn't managed
      */
      
      index = mrBody.indexOf('</td>', index);
    }
    
    // Find the scoring summary
    posTableGoals = response.indexOf('<table id="game-goals">');
    gameGoals = response.substring(posTableGoals,
                                   response.indexOf('</table>', posTableGoals));
    
    // Search for goals
    goals = [], index = 0;
    
    for(;;) {
      index = gameGoals.indexOf('<tr>', index);
      
      /***/
      if (index == -1)
        break;
      /***/
      
      // Remove HTML tags
      row = gameGoals.substring(index, gameGoals.indexOf('</tr>', index));
      row = row.replace(/<td>/g, "@").replace(/<\/td>/g, "").replace(/<tr>/g, "").replace('@', "");
      
      if (row.indexOf('<th') == -1)
        goals.push(row.split("@")); // Add the new goal
      
      index = gameGoals.indexOf('</tr>', index);
    }
    
    // Team stats
    score = matchReports[i]['Score'].split(' - ');
    
    if (goals.length > 0) {
      if (goals[goals.length - 1][5] == 3) {
        overtime = true;
        overtimeEnd = goals[goals.length - 1][4];
      }
      else
        overtime = false;
    }
    
    // Individual stats
    for(var key in players) {
      players[key]['PlayingTime'] = countPlayingTime(getTimes(players[key]['Halves'],
                                                              players[key]['Subs']),
                                                     overtimeEnd); // Playing time
    }
    
    var loserFinalScore = (parseInt(score[0]) < parseInt(score[1])) ?
                           parseInt(score[0]) : parseInt(score[1]);
    ++loserFinalScore;
    
    var winnerScore = 0, winningTeam;
    winningTeam = (parseInt(score[1]) > parseInt(score[0])) ? matchReports[i]['HomeTeam']
                                                            : matchReports[i]['AwayTeam'];
    
    for (var g = 0; g != goals.length; ++g) {
      if (goals[g][0] == winningTeam)
        ++winnerScore; // Add a goal to the winning team
      
      // Convert time and half of the goal
      var minute = parseInt(goals[g][4].split(":")[0], 10); // Minute
      var half = parseInt(goals[g][5], 10); // Half
      minute = minute + (half * 5) - 5;
      goals[g][4] = minute.toString() + ":" + goals[g][4].split(":")[1];
      
      for(var key in players) {
        if (checkTimeIntervals(goals[g][4], getTimes(players[key]['Halves'], players[key]['Subs']))) {
          if (players[key]['Name'] == goals[g][1])
            players[key]['Goals'] += 1; // Add a goal to the player
          
          if (players[key]['Name'] == goals[g][2] || players[key]['Name'] == goals[g][3]) // Assist
            players[key]['Assists'] += 1; // Add an assist to the player
          
          if (players[key]['Name'] == goals[g][1] && goals[g][5] == 3)
            players[key]['OtGoal'] = true; // Add an overtime goal to the player
          
          players[key]['Differential'] += (players[key]['Team'] == goals[g][0]) ? 1 : -1; // Differential
          
          if (players[key]['Team'] != goals[g][0])
            players[key]['GoalsAgainst'] += 1; // Add goal against
          else
            players[key]['GoalsFor'] += 1; // Add goal for
          
          if (players[key]['Name'] == goals[g][1] && players[key]['Team'] == winningTeam
              && winnerScore == loserFinalScore)
            players[key]['WinningGoal'] = true; // Add game winning goal
          
          if (players[key]['Position'] == "Goalkeeper" && winnerScore == loserFinalScore) {
            if (players[key]['Team'] == winningTeam) {
              if (players[key]['Team'] == goals[g][0]) {
                players[key]['Result'] = "W"; // Win
               
                gameLength = 600;
                if (goals[g][5] == 3) {
                  gameLength += parseInt(overtimeEnd.split(":")[0], 10) * 60
                                + parseInt(overtimeEnd.split(":")[1], 10); // For overtime
                }
                
                if (players[key]['PlayingTime'] == gameLength && loserFinalScore == 1/*players[key]['GoalsAgainst'] == 0*/)
                  players[key]['Shutout'] = true;
              }
            }
            else {
              if (goals[g][5] == 3)
                players[key]['Result'] = "OT"; // Overtime loss
              else
                players[key]['Result'] = "L"; // Loss 
            }
          }
        }
      }
    }
    
    /***/
    if ((Date.now() - startTime) > 240000)
      break;
    /***/
    
    //Logger.log(score[0] + " " + score[1]);
    
    // Team, Result, Goals For, Goals Against, Overtime, Scored First
    gameLogArray.push([matchReports[i]['AwayTeam'],
                      (parseInt(score[0]) > parseInt(score[1])) ? ((overtime) ? 'OW' : 'W') : ((overtime) ? 'OL' : 'L'),
                      score[0], score[1], overtime,
                      (goals.length > 0 && goals[0][0] == matchReports[i]['AwayTeam'])]);
    
    gameLogArray.push([matchReports[i]['HomeTeam'],
                      (parseInt(score[1]) > parseInt(score[0])) ? ((overtime) ? 'OW' : 'W') : ((overtime) ? 'OL' : 'L'),
                      score[1], score[0], overtime,
                      (goals.length > 0 && goals[0][0] == matchReports[i]['HomeTeam'])]);
    
    // Find Match Report ID
    posReportId = response.indexOf('http://www.sphaxball.com/matchreporter?');
    reportId = response.substring(response.indexOf('#', posReportId)+1,
                                  response.indexOf('<', posReportId));
    
    // Key, Player, Position, Team, Started, Playing time, Goals, Assists, Differential,
    // Goals Against, Goals For, OT goal, Winning goal, Result, Shutout
    for(var key in players) {
      playerLogArray.push([key, players[key]['Name'], players[key]['Position'], players[key]['Team'],
                           players[key]['Started'], players[key]['PlayingTime'], players[key]['Goals'],
                           players[key]['Assists'], players[key]['Differential'], players[key]['GoalsAgainst'],
                           players[key]['GoalsFor'], players[key]['OtGoal'], players[key]['WinningGoal'],
                           players[key]['Result'], players[key]['Shutout'], reportId]);
    }
    
    // Add every Match Report URL to the logs
    matchReportArray.push([matchReports[i]['URL']]);
  }
  
  // Set Values with Arrays
  gameLog.getRange(1, 1, gameLogArray.length, gameLogArray[0].length).setValues(gameLogArray);
  playerLog.getRange(1, 1, playerLogArray.length, playerLogArray[0].length).setValues(playerLogArray);
  matchReportLogSheet.getRange(1, 1, matchReportArray.length, matchReportArray[0].length).setValues(matchReportArray);
  
  // Le problème qu'il reste, c'est le playing time qui n'est pas bon, par exemple, ça dit que jason a joué 10 minutes
  
  //Logger.log(playerLogArray);
  //Logger.log(players['jason97 - Forward']['Subs']);
  
  /*Logger.log(countPlayingTime(getTimes(players['HashBrowns - Forward']['Halves'], players['HashBrowns - Forward']['Subs']), overtimeEnd));
  Logger.log(getTimes(players['HashBrowns - Forward']['Halves'], players['HashBrowns - Forward']['Subs']));*/
  
  /*Logger.log(countPlayingTime(getTimes(players['jason97 - Forward']['Halves'], players['jason97 - Forward']['Subs']), overtimeEnd));
  Logger.log(getTimes(players['jason97 - Forward']['Halves'], players['jason97 - Forward']['Subs']));*/
  
  Logger.log("getScoringSummary end");
}

// Find an object in an array
function find(arr, obj) {
  for(var i = 0;  i != arr.length; ++i) {
    if (arr[i] == obj)
      return true;
  }
  
  return false;
}

// Format Decimal number as ".000"
function toPercentFormat(number) {
  if ( ! isNaN(number)) {
    number = number.toFixed(3); // Three decimals with fill zeros
    
    if (number < 1)
      number = number.toString().substring(1);
  }
  else
    number = ".000";
  
  return number;
}

// Build Team stats from the Games Log
function doTeamStats() {
  Logger.log("doTeamStats begin");
  
  // Standings
  var standings = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Standings");
  var standingsArray = [];
  standings.clear(); // Clear actual content before beginning
  standings.appendRow(["", "", "GP", "W", "OW", "L", "OL", "P", "GF", "GA", "DIFF",
                      "P%", "G/G", "GA/G", "Sc 1%", "Tr 1%", "L5", "STREAK"]); // Table Headers
  
  // Team Stats (rough standings)
  var team_stats = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("team_stats");
  team_stats.clear(); // Clear actual content before beginning
  
  team_stats.getRange("A1").setFormula("=UNIQUE('game_log'!A:A)"); // List of teams
  team_stats.getRange("B1").setFormula("=COUNTA(A:A)"); // Count teams
  
  // Create a subrange with the Team records only
  var sub_range_team = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sub_range_team");
  var goal_differential, point_percentage, sc_first_percentage, tr_first_percentage; // Special formatting
  
  for (var i = 1; i != team_stats.getRange("B1").getValue()+1; ++i) {
    sub_range_team.clear();
    sub_range_team.getRange("A1").setFormula("=QUERY('game_log'!A:F;\"SELECT * WHERE A LIKE '%\"& 'team_stats'!A" + i + " &\"%'\")");
    
    team_stats.getRange(i, 3).setFormula("=COUNTA('sub_range_team'!A:A)"); // Games Played
    team_stats.getRange(i, 4).setFormula("=COUNTIF('sub_range_team'!B:B, \"W\")"); // Wins
    team_stats.getRange(i, 5).setFormula("=COUNTIF('sub_range_team'!B:B, \"OW\")"); // OT Wins
    team_stats.getRange(i, 6).setFormula("=COUNTIF('sub_range_team'!B:B, \"L\")"); // Losses
    team_stats.getRange(i, 7).setFormula("=COUNTIF('sub_range_team'!B:B, \"OL\")"); // OT Losses
    team_stats.getRange(i, 8).setFormula("=SUM(PRODUCT(D1 * 3), PRODUCT(E1 * 2), PRODUCT(G1 * 1))"); // Points
    team_stats.getRange(i, 9).setFormula("=SUM('sub_range_team'!C:C)"); // Goals For
    team_stats.getRange(i, 10).setFormula("=SUM('sub_range_team'!D:D)"); // Goals Against
    team_stats.getRange(i, 11).setFormula("=MINUS(I1, J1)"); // Goals Differential
    team_stats.getRange(i, 12).setFormula("=DIVIDE(H1, PRODUCT(C1 * 3))"); // Point percentage
    team_stats.getRange(i, 13).setFormula("=DIVIDE(I1, C1)"); // Goals Per Game
    team_stats.getRange(i, 14).setFormula("=DIVIDE(J1, C1)"); // Goals Against Per Game
    
    team_stats.getRange(i, 15).setFormula("=DIVIDE(" +
              "(ARRAYFORMULA(SUM((('sub_range_team'!B:B=\"W\") + ('sub_range_team'!B:B=\"OW\")) * ('sub_range_team'!F:F=TRUE))))," +
              "(COUNTIF('sub_range_team'!F:F, TRUE)))"); // Winning % - Scoring First
    team_stats.getRange(i, 16).setFormula("=DIVIDE(" +
              "(ARRAYFORMULA(SUM((('sub_range_team'!B:B=\"W\") + ('sub_range_team'!B:B=\"OW\")) * ('sub_range_team'!F:F=FALSE))))," +
              "(COUNTIF('sub_range_team'!F:F, FALSE)))"); // Winning % - Trailing First
    
    // Last 5
    team_stats.getRange(i, 17).setFormula("=CONCATENATE(" +
              "(COUNTIF(INDEX('sub_range_team'!B:B, 'team_stats'!C1-4, 1):INDEX('sub_range_team'!B:B, 'team_stats'!C1, 1), \"W\")), \"-\"," +
              "(COUNTIF(INDEX('sub_range_team'!B:B, 'team_stats'!C1-4, 1):INDEX('sub_range_team'!B:B, 'team_stats'!C1, 1), \"OW\")), \"-\"," +
              "(COUNTIF(INDEX('sub_range_team'!B:B, 'team_stats'!C1-4, 1):INDEX('sub_range_team'!B:B, 'team_stats'!C1, 1), \"L\")), \"-\"," +
              "(COUNTIF(INDEX('sub_range_team'!B:B, 'team_stats'!C1-4, 1):INDEX('sub_range_team'!B:B, 'team_stats'!C1, 1), \"OL\")))");
    
    // Streak
    var lastGame = sub_range_team.getRange(team_stats.getRange("C1").getValue(), 2).getValue();
    var streak = (lastGame == "L") ? "LOST" : ((lastGame == "OL") ? "OT" : "WON"); // Current streak
    var streakLong = 0, result, newStreak;
    
    for (var j = team_stats.getRange("C1").getValue(); j != 0; --j, ++streakLong) {
      result = sub_range_team.getRange(j, 2).getValue();
      newStreak = (result == "L") ? "LOST" : ((result == "OL") ? "OT" : "WON");
      
      /***/
      if (newStreak != streak)
        break;
      /***/
    }
    
    team_stats.getRange(i, 18).setValue(streak + ' ' + streakLong);
    
    // Add team stats to the Standings spreadsheet
    // Special formattings
    goal_differential = (team_stats.getRange(i, 11).getValue() > 0) ? "+" +
                         team_stats.getRange(i, 11).getValue() :
                         team_stats.getRange(i, 11).getValue();
    point_percentage = toPercentFormat(team_stats.getRange(i, 12).getValue());
    sc_first_percentage = toPercentFormat(team_stats.getRange(i, 15).getValue());
    tr_first_percentage = toPercentFormat(team_stats.getRange(i, 16).getValue());
    
    // The first cell is reserved for the team position
    standingsArray.push(["", team_stats.getRange(i, 1).getValue().toUpperCase(), team_stats.getRange(i, 3).getValue(),
                         team_stats.getRange(i, 4).getValue(), team_stats.getRange(i, 5).getValue(),
                         team_stats.getRange(i, 6).getValue(), team_stats.getRange(i, 7).getValue(),
                         team_stats.getRange(i, 8).getValue(), team_stats.getRange(i, 9).getValue(),
                         team_stats.getRange(i, 10).getValue(), goal_differential,
                         point_percentage, team_stats.getRange(i, 13).getValue(),
                         team_stats.getRange(i, 14).getValue(), sc_first_percentage,
                         tr_first_percentage, team_stats.getRange(i, 17).getValue(),
                         team_stats.getRange(i, 18).getValue()]);
  }
  
  // Write the standings array in the standings sheet
  standings.getRange(2, 1, standingsArray.length, standingsArray[0].length).setValues(standingsArray);
  
  // Sort the standings
  var numberOfTeams = team_stats.getRange("B1").getValue();
  var gamesPlayed = team_stats.getRange("C1").getValue();
  var sortTeams = standings.getRange(2, 1, numberOfTeams, 18); // Without headers
  sortTeams.sort([{column: 8, ascending: false}, {column: 4, ascending: false},
                  {column: 11, ascending: false}]); // Sorted by Points, Wins and Goal Difference
  
  // Formatting
  var range = standings.getRange("A:R");
  range.setBackground("#000000");
  range.setFontColor("#eeeeee");
  range.setFontFamily("Verdana"); // Text font
  range.setFontSize(10); // Text size
  range.setHorizontalAlignment("center"); // Text centered
  range.setVerticalAlignment("middle"); // Text in middle
  
  // Format the Team Names
  var teamNames = standings.getRange(2, 2, numberOfTeams, 1);
  teamNames.setFontLine("underline");
  teamNames.setHorizontalAlignment("left");
  
  // Lines background color and Team Position
  for (var f = 2; f <= numberOfTeams + 1; ++f) {
    if (f % 2 == 1)
      standings.getRange(f, 1, 1, 18).setBackground("#232323"); // Range of the line
    else
      standings.getRange(f, 1, 1, 18).setBackground("#000000");
    
    standings.getRange(f, 1).setValue(f - 1);
  }
  
  // Headers formatting
  var headers = standings.getRange(1, 1, 1, 18);
  headers.setFontWeight("bold");
  headers.setBackground("#869927");
  headers.setFontColor("#ffffff");
  
  // Points column formatting
  standings.getRange(1, 8, numberOfTeams + 1, 1).setBackground("#434343");
  standings.getRange(1, 8, 1, 1).setFontColor("#cdcdcd");
  
  // Goal Differential formatting
  var columnDiff = standings.getRange(2, 11, standings.getLastRow()-1, 1);
  var oValues = columnDiff.getValues();

  for (var i = 0; i < oValues.length; ++i) {
    if (oValues[i][0] < 0)
      standings.getRange(i + 2, 11, 1, 1).setFontColor('#cc0000'); // Red for negative values
    else
      standings.getRange(i + 2, 11, 1, 1).setFontColor('#38761d'); // Green for positives
  }
  
  Logger.log("doTeamStats end");
}

// Team names formatting
function formatTeamName(names) {
  var teams = names.trim().split(", "), teamWords, newString = "";
  
  for (var i = 0; i != teams.length; ++i) {
    teamWords = teams[i].trim().split(" ");
  
    if (teamWords.length == 1)
      newString += teams[i].substring(0, 3).toUpperCase() + ", ";
    else if (teamWords.length == 2)
      newString += teamWords[1].substring(0, 3).toUpperCase() + ", ";
    else if (teamWords.length == 3)
      newString += teamWords[0][0] + teamWords[1][0] + teamWords[2][0] + ", ";
    else if (teamWords.length == 4)
      newString += teamWords[0][0] + teamWords[1][0] + teamWords[2][0] + teamWords[3][0] + ", ";
  }
  
  return newString.substring(0, newString.length-2);
}

// Positions formatting
function formatPositions(names) {
  var positions = names.trim().split(", "), newString = "";
  
  for (var i = 0; i != positions.length; ++i)
    newString += positions[i].replace("Forward", "FWD").replace("Midfielder", "MID").replace("Goalkeeper", "GK") + ", ";
  
  return newString.substring(0, newString.length-3);
}

// Build Player stats from the Player Log
function doPlayerStats() {
  Logger.log("doPlayerStats begin");
  
  // Player stats
  var players = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Players");
  var playersArray = [];
  players.clear(); // Clear actual content before beginning
  players.appendRow(["", "Player", "Team", "Pos", "GP", "GS", "G", "A", "P",
                     "+/-", "GF", "GA", "OT", "GW", "P/G", "MP/M", "MP/F", "MP"]); // Table Headers
  
  // Player Stats (rough player stats)
  var player_stats = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("player_stats");
  player_stats.clear(); // Clear actual content before beginning
  
  player_stats.getRange("A1").setFormula("=UNIQUE(FILTER('player_log'!B:B; ('player_log'!C:C=\"Forward\")" +
                                         "+ ('player_log'!C:C=\"Midfielder\")))"); // List of players
  
  player_stats.getRange("D1").setFormula("=COUNTA(A:A)"); // Count players
  
  // Create a subrange with the Player records only
  var sub_range_player = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sub_range_player");
  var goal_differential, minutesPlayed, minutesPlayedMid, minutesPlayedFwd, teamName, positions; // Special formatting
  
  // Set the formulas for the Player stats
  player_stats.getRange(1, 2).setFormula("=JOIN(\", \" ; UNIQUE('sub_range_player'!C:C))"); // Positions
  player_stats.getRange(1, 3).setFormula("=JOIN(\", \" ; UNIQUE('sub_range_player'!D:D))"); // Teams
  player_stats.getRange(1, 5).setFormula("=COUNTUNIQUE('sub_range_player'!P:P)"); // Games Played
  player_stats.getRange(1, 6).setFormula("=COUNTIF('sub_range_player'!E:E, TRUE)"); // Games Started
  player_stats.getRange(1, 7).setFormula("=SUM('sub_range_player'!G:G)"); // Goals
  player_stats.getRange(1, 8).setFormula("=SUM('sub_range_player'!H:H)"); // Assists
  player_stats.getRange(1, 9).setFormula("=SUM(G1 + H1)"); // Points
  player_stats.getRange(1, 10).setFormula("=SUM('sub_range_player'!I:I)"); // Differential
  player_stats.getRange(1, 11).setFormula("=SUM('sub_range_player'!K:K)"); // Goals For
  player_stats.getRange(1, 12).setFormula("=SUM('sub_range_player'!J:J)"); // Goals Against
  player_stats.getRange(1, 13).setFormula("=COUNTIF('sub_range_player'!L:L, TRUE)"); // Overtime Goals
  player_stats.getRange(1, 14).setFormula("=COUNTIF('sub_range_player'!M:M, TRUE)"); // Game Winning Goals
  player_stats.getRange(1, 15).setFormula("=DIVIDE(I1, E1)"); // Average points per game
  player_stats.getRange(1, 16).setFormula("=SUM(FILTER('sub_range_player'!F:F; 'sub_range_player'!C:C=\"Midfielder\"))"); // Time at Midfielder
  player_stats.getRange(1, 17).setFormula("=SUM(FILTER('sub_range_player'!F:F; 'sub_range_player'!C:C=\"Forward\"))"); // Time at Forward
  player_stats.getRange(1, 18).setFormula("=SUM('sub_range_player'!F:F)"); // Time on field
  
  // Offensive stats
  for (var i = 1; i != player_stats.getRange("D1").getValue()+1; ++i) {
    sub_range_player.clear();
    sub_range_player.getRange("A1").setFormula("=QUERY('player_log'!A:P;\"SELECT * WHERE (C = 'Forward'" +
                                               "OR C = 'Midfielder') AND B LIKE '%\"& 'player_stats'!A" + i + " &\"%'\")");
    
    // Special formattings
    goal_differential = (player_stats.getRange(1, 10).getValue() > 0) ? "+" +
                         player_stats.getRange(1, 10).getValue() :
                         player_stats.getRange(1, 10).getValue();
    
    minutesPlayedMid = player_stats.getRange(1, 16).getValue();
    minutesPlayedMid = ((isNaN(Math.floor(minutesPlayedMid / 60))) ? "0" : Math.floor(minutesPlayedMid / 60))
                       + ":" + (((minutesPlayedMid % 60) < 10) ? "0" : "")
                       + ((isNaN(minutesPlayedMid % 60)) ? "00" : (minutesPlayedMid % 60));
    
    minutesPlayedFwd = player_stats.getRange(1, 17).getValue();
    minutesPlayedFwd = ((isNaN(Math.floor(minutesPlayedFwd / 60))) ? "0" : Math.floor(minutesPlayedFwd / 60))
                       + ":" + (((minutesPlayedFwd % 60) < 10) ? "0" : "")
                       + ((isNaN(minutesPlayedFwd % 60)) ? "00" : (minutesPlayedFwd % 60));
    
    minutesPlayed = player_stats.getRange(1, 18).getValue();
    minutesPlayed = ((isNaN(Math.floor(minutesPlayed / 60))) ? "0" : Math.floor(minutesPlayed / 60))
                    + ":" + (((minutesPlayed % 60) < 10) ? "0" : "")
                    + ((isNaN(minutesPlayed % 60)) ? "00" : (minutesPlayed % 60));
    
    teamName = formatTeamName(player_stats.getRange(1, 3).getValue());
    positions = formatPositions(player_stats.getRange(1, 2).getValue());
    
    playersArray.push(["", player_stats.getRange(i, 1).getValue(), teamName,
                       positions, player_stats.getRange(1, 5).getValue(),
                       player_stats.getRange(1, 6).getValue(), player_stats.getRange(1, 7).getValue(),
                       player_stats.getRange(1, 8).getValue(), player_stats.getRange(1, 9).getValue(),
                       goal_differential, player_stats.getRange(1, 11).getValue(),
                       player_stats.getRange(1, 12).getValue(), player_stats.getRange(1, 13).getValue(),
                       player_stats.getRange(1, 14).getValue(), player_stats.getRange(1, 15).getValue(),
                       minutesPlayedMid, minutesPlayedFwd, minutesPlayed, player_stats.getRange(1, 18).getValue()]);
  }
  
  // Write the players array in the players sheet
  players.getRange(2, 1, playersArray.length, playersArray[0].length).setValues(playersArray);
  
  // Sort the players
  var numberOfPlayers = player_stats.getRange("D1").getValue();
  var sortPlayers = players.getRange(2, 1, numberOfPlayers, 19); // Without headers
  sortPlayers.sort([{column: 9, ascending: false}, {column: 19, ascending: true},
                  {column: 15, ascending: false}]); // Sorted by Points, Games Played, Average points per game
  
  // Formatting
  var range = players.getRange("A:R");
  range.setBackground("#000000");
  range.setFontColor("#eeeeee");
  range.setFontFamily("Verdana"); // Text font
  range.setFontSize(10); // Text size
  range.setHorizontalAlignment("center"); // Text centered
  range.setVerticalAlignment("middle"); // Text in middle
  
  // Format the Player Names
  var playerNames = players.getRange(1, 2, numberOfPlayers + 1, 1);
  playerNames.setHorizontalAlignment("left");
  
  // Lines background color and Player Position
  for (var f = 2; f <= numberOfPlayers + 1; ++f) {
    if (f % 2 == 1)
      players.getRange(f, 1, 1, 18).setBackground("#232323"); // Range of the line
    else
      players.getRange(f, 1, 1, 18).setBackground("#000000");
    
    players.getRange(f, 1).setValue(f - 1);
  }
  
  // Headers formatting
  var headers = players.getRange(1, 1, 1, 18);
  headers.setFontWeight("bold");
  headers.setBackground("#869927");
  headers.setFontColor("#ffffff");
  
  // Points column formatting
  players.getRange(1, 9, numberOfPlayers + 1, 1).setBackground("#434343");
  players.getRange(1, 9, 1, 1).setFontColor("#cdcdcd");
  
  // Goal Differential formatting
  var columnDiff = players.getRange(2, 10, players.getLastRow()-1, 1);
  var oValues = columnDiff.getValues();

  for (var i = 0; i < oValues.length; ++i) {
    if (oValues[i][0] < 0)
      players.getRange(i + 2, 10, 1, 1).setFontColor('#cc0000'); // Red for negative values
    else
      players.getRange(i + 2, 10, 1, 1).setFontColor('#38761d'); // Green for positives
  }
  
  Logger.log("doPlayerStats end");
}

// Build Goalkeeper stats from the Player Log
function doGoalkeeperStats() {
  Logger.log("doGoalkeeperStats begin");
  
  // Goalkeeper stats
  var goalkeepers = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Goalkeepers");
  var goalkeepersArray = [];
  goalkeepers.clear(); // Clear actual content before beginning
  goalkeepers.appendRow(["", "Player", "Team", "GP", "GS", "W", "L", "OT", "GF", "GA", "GAA",
                         "+/-", "SO", "G", "A", "MP"]); // Table Headers
  
  // Goalkeeper Stats (rough goalkeeper stats)
  var goalkeeper_stats = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("goalkeeper_stats");
  goalkeeper_stats.clear(); // Clear actual content before beginning
  
  goalkeeper_stats.getRange("A1").setFormula("=UNIQUE(FILTER('player_log'!B:B; ('player_log'!C:C=\"Goalkeeper\")))"); // List of goalkeepers
  
  goalkeeper_stats.getRange("B1").setFormula("=COUNTA(A:A)"); // Count goalkeepers
  
  // Create a subrange with the Goalkeeper records only
  var sub_range_goalkeeper = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sub_range_goalkeeper");
  var goal_differential, minutesPlayed, teamName, positions; // Special formatting

  // Set the formulas for Goalkeeper stats
  goalkeeper_stats.getRange(1, 3).setFormula("=JOIN(\", \" ; UNIQUE('sub_range_goalkeeper'!D:D))"); // Teams
  goalkeeper_stats.getRange(1, 4).setFormula("=COUNTUNIQUE('sub_range_goalkeeper'!P:P)"); // Games Played
  goalkeeper_stats.getRange(1, 5).setFormula("=COUNTIF('sub_range_goalkeeper'!E:E, TRUE)"); // Games Started
  goalkeeper_stats.getRange(1, 6).setFormula("=COUNTIF('sub_range_goalkeeper'!N:N, \"W\")"); // Wins
  goalkeeper_stats.getRange(1, 7).setFormula("=COUNTIF('sub_range_goalkeeper'!N:N, \"L\")"); // Losses
  goalkeeper_stats.getRange(1, 8).setFormula("=COUNTIF('sub_range_goalkeeper'!N:N, \"OT\")"); // Overtime losses
  goalkeeper_stats.getRange(1, 9).setFormula("=SUM('sub_range_goalkeeper'!K:K)"); // Goals For
  goalkeeper_stats.getRange(1, 10).setFormula("=SUM('sub_range_goalkeeper'!J:J)"); // Goals Against
  goalkeeper_stats.getRange(1, 11).setFormula("=PRODUCT(DIVIDE(J1;DIVIDE(P1;60));10)"); // Goals Against Average
  goalkeeper_stats.getRange(1, 12).setFormula("=SUM('sub_range_goalkeeper'!I:I)"); // Differential
  goalkeeper_stats.getRange(1, 13).setFormula("=COUNTIF('sub_range_goalkeeper'!O:O, TRUE)"); // Shutouts
  goalkeeper_stats.getRange(1, 14).setFormula("=SUM('sub_range_goalkeeper'!G:G)"); // Goals
  goalkeeper_stats.getRange(1, 15).setFormula("=SUM('sub_range_goalkeeper'!H:H)"); // Assists
  goalkeeper_stats.getRange(1, 16).setFormula("=SUM('sub_range_goalkeeper'!F:F)"); // Time on field
  
  // Goaltending stats
  for (var i = 1; i != goalkeeper_stats.getRange("B1").getValue()+1; ++i) {
    sub_range_goalkeeper.clear();
    sub_range_goalkeeper.getRange("A1").setFormula("=QUERY('player_log'!A:P;\"SELECT * WHERE C = 'Goalkeeper'" +
                                                   " AND B LIKE '%\"& 'goalkeeper_stats'!A" + i + " &\"%'\")");
    
    // Special formattings
    goal_differential = (goalkeeper_stats.getRange(1, 12).getValue() > 0) ? "+" +
                         goalkeeper_stats.getRange(1, 12).getValue() :
                         goalkeeper_stats.getRange(1, 12).getValue();
    
    minutesPlayed = goalkeeper_stats.getRange(1, 16).getValue();
    minutesPlayed = ((isNaN(Math.floor(minutesPlayed / 60))) ? "0" : Math.floor(minutesPlayed / 60))
                    + ":" + (((minutesPlayed % 60) < 10) ? "0" : "")
                    + ((isNaN(minutesPlayed % 60)) ? "00" : (minutesPlayed % 60));
    
    teamName = formatTeamName(goalkeeper_stats.getRange(1, 3).getValue());
    
    goalkeepersArray.push(["", goalkeeper_stats.getRange(i, 1).getValue(), teamName,
                          goalkeeper_stats.getRange(1, 4).getValue(), goalkeeper_stats.getRange(1, 5).getValue(),
                          goalkeeper_stats.getRange(1, 6).getValue(), goalkeeper_stats.getRange(1, 7).getValue(),
                          goalkeeper_stats.getRange(1, 8).getValue(), goalkeeper_stats.getRange(1, 9).getValue(),
                          goalkeeper_stats.getRange(1, 10).getValue(), goalkeeper_stats.getRange(1, 11).getValue(), goal_differential,
                          goalkeeper_stats.getRange(1, 13).getValue(), goalkeeper_stats.getRange(1, 14).getValue(),
                          goalkeeper_stats.getRange(1, 15).getValue(), minutesPlayed,
                          goalkeeper_stats.getRange(1, 16).getValue()]);
  }
  
  // Write the goalkeepers array in the goalkeepers sheet
  goalkeepers.getRange(2, 1, goalkeepersArray.length, goalkeepersArray[0].length).setValues(goalkeepersArray);
  
  // Sort the goalkeepers
  var numberOfGoalkeepers = goalkeeper_stats.getRange("B1").getValue();
  var sortGoalkeepers = goalkeepers.getRange(2, 1, numberOfGoalkeepers, 17); // Without headers
  sortGoalkeepers.sort([{column: 6, ascending: false}, {column: 11, ascending: true},
                        {column: 17, ascending: true}]); // Sorted by Wins, GAA, Playing time
  
  // Formatting
  var range = goalkeepers.getRange("A:P");
  range.setBackground("#000000");
  range.setFontColor("#eeeeee");
  range.setFontFamily("Verdana"); // Text font
  range.setFontSize(10); // Text size
  range.setHorizontalAlignment("center"); // Text centered
  range.setVerticalAlignment("middle"); // Text in middle
  
  // Format the Player Names
  var goalkeepersNames = goalkeepers.getRange(1, 2, numberOfGoalkeepers + 1, 1);
  goalkeepersNames.setHorizontalAlignment("left");
  
  // Lines background color and Player Position
  for (var f = 2; f <= numberOfGoalkeepers + 1; ++f) {
    if (f % 2 == 1)
      goalkeepers.getRange(f, 1, 1, 16).setBackground("#232323"); // Range of the line
    else
      goalkeepers.getRange(f, 1, 1, 16).setBackground("#000000");
    
    goalkeepers.getRange(f, 1).setValue(f - 1);
  }
  
  // Headers formatting
  var headers = goalkeepers.getRange(1, 1, 1, 16);
  headers.setFontWeight("bold");
  headers.setBackground("#869927");
  headers.setFontColor("#ffffff");
  
  // Wins column formatting
  goalkeepers.getRange(1, 6, numberOfGoalkeepers + 1, 1).setBackground("#434343");
  goalkeepers.getRange(1, 6, 1, 1).setFontColor("#cdcdcd");
  
  // Goal Differential formatting
  var columnDiff = goalkeepers.getRange(2, 12, goalkeepers.getLastRow()-1, 1);
  var oValues = columnDiff.getValues();

  for (var i = 0; i < oValues.length; ++i) {
    if (oValues[i][0] < 0)
      goalkeepers.getRange(i + 2, 12, 1, 1).setFontColor('#cc0000'); // Red for negative values
    else
      goalkeepers.getRange(i + 2, 12, 1, 1).setFontColor('#38761d'); // Green for positives
  }
  
  Logger.log("doGoalkeeperStats end");
}

// Build stats from all of the match reports
function BuildStatsFromScratch() {
  getScoringSummary(false); // Start all over
}

// Build stats from the latest ending point
function BuildStatsContinue() {
  getScoringSummary(true); // Only analyze the new Match Reports
}