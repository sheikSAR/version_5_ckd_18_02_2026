clc; clear; close all;
filename = "Clinical_data_EGFR_Prediction_161225.xlsx";
%filename = "EFSD_27022026.xlsx";
% Create the table with missing data
T1 = readtable(filename);
% Replace OHA, HT, and Insulin NANs with 0
T1.Hypertension(find(isnan(T1.Hypertension))) = 0;
T1.OHA(find(isnan(T1.OHA))) = 0;
T1.INSULIN(isnan(T1.INSULIN)) = 0;
%X1 = table2array(T1(:,1:end));
T1 = removevars(T1, ...
    {'DR_OD','DR_OS','DME_OS','DME_OD','DR_SEVERITY_OD','DR_SEVERITY_OS'});
y1 = T1.EGFR;
% NANs
rowsWithNaN = any(ismissing(T1),2);
NANrowIds = find(rowsWithNaN);
nlength = length(NANrowIds);
colsWithNaN = any(ismissing(T1),1);
T1.Properties.VariableNames(colsWithNaN)
nanCount = sum(ismissing(T1));
table(T1.Properties.VariableNames', nanCount', ...
    'VariableNames',{'Variable','NaN_Count'})
totalNaNs = sum(sum(ismissing(T1))); %715
nanReport = CKD_NaN_Report(T1)
missingTable = missingDataReport(T1);
fullMissingTable = createFullMissingTable(T1);
multiMissingTable = fullMissingTable(fullMissingTable.MissingCount > 1,:);
disp(multiMissingTable)
% Run the multiple imputation tool
results = CKD_multiImputationPipeline(T1);
results1 = CKD_optimizedImputationPipeline(T1)
results2 = CKD_researchImputationPipeline(T1)
Tcleaned = T1;
Tcleaned.CHO = results2.cleanedData.CHO;
Tcleaned.TRI = results2.cleanedData.TRI;
Tcleaned.BMI = results2.cleanedData.BMI;
Tcleaned.HB = results2.cleanedData.HB;
Tcleaned.HBA = results2.cleanedData.HBA;
% Having run the imputation remove outliers
statsTableTcleaned = statisticalanalysis(Tcleaned);
statsTableActual = statisticalanalysis(T1);
%[Tclean, report] = processOutliersFromStats(Tcleaned, statsTableTcleaned, "winsorize");
generateDatapipelineReport(T1,Tcleaned,statsTableTcleaned);
% MCMC analysis for adding data
results = CKD_fullAugmentationPipeline(Tcleaned,"bootstrap",2000);
Taugmented = results.augmentedData
% Check the augmentation
approval = CKD_augmentationApprovalReport(results.validation,results.correlationError,true);
figure('Name','AugmentedDataCheck')
subplot(2,1,1)
histogram(Tcleaned.EGFR,30,'Normalization','pdf')
legend("Actual Data")
subplot(2,1,2)
histogram(Taugmented.EGFR,30,'Normalization','pdf')
legend("Augmented Data")
title("EGFR Distribution Check")
% Modelling pipeline
Tfinal = Taugmented(:,2:end);
y = Tfinal.EGFR;
Tfinal.EGFR = [];
X = table2array(Tfinal)
% Modelling Pipeline
% LinearModel = fitlm(X,y);
% predictionsLinearModel = predict(LinearModel,X)
% Output = [y predictionsLinearModel abs(y-predictionsLinearModel)]
% 
% evaluvateLinearModel = evaluateCKDModel(y,predictionsLinearModel);
results = trainCKDModelsExhaustive(X,y);
plotCKDModelPerformance(results.metrics);
explainCKDModels(results.metrics);
%[results, finalModel] = CKDModelPipelineAutoEval(X, y, 'CKD_finalModel.mat');