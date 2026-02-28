function nanReport = CKD_NaN_Report(T)

vars = T.Properties.VariableNames;
nVar = length(vars);

nanCount = zeros(nVar,1);
nanPercent = zeros(nVar,1);
nanRows = cell(nVar,1);

N = height(T);

fprintf('\n========= CKD MISSING DATA REPORT =========\n')

for i = 1:nVar
    
    v = vars{i};
    data = T.(v);
    
    % Detect missing values (works for numeric, categorical, string)
    idx = ismissing(data);
    
    nanCount(i) = sum(idx);
    nanPercent(i) = 100*nanCount(i)/N;
    nanRows{i} = find(idx)';
    
    if nanCount(i) > 0
        fprintf('\n%s → %d NaNs (%.2f%%) | Rows: ',...
            v,nanCount(i),nanPercent(i))
        disp(nanRows{i})
    end
end

% Create summary table
nanReport = table(vars', nanCount, nanPercent, nanRows,...
    'VariableNames',{'Variable','NaN_Count','NaN_Percent','Rows'});

fprintf('\n========= SUMMARY =========\n')
disp(nanReport)

end